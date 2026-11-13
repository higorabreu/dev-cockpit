import {
  type BaseSource,
  type BranchInfo,
  baseCandidates,
  branchName,
  createdFrom,
  isBaseRef,
  isOnBase,
  nearestBase,
  type ReviewBase,
} from '@dck/core'

// Answers a quick git command with its trimmed output, or undefined when it failed
export type GitAsk = (root: string, args: readonly string[]) => Promise<string | undefined>

// The HEAD reflog is long in an old clone; the move that created a branch is rarely this far back
const HEAD_LOG_ENTRIES = 2000
// Findings kept, one per repository and HEAD; a few tabs on a few repositories fit
const KEPT = 16

const lines = (text: string | undefined) => (text ? text.split('\n').filter(Boolean) : [])

// The branch the review compares with: the user's choice, VS Code's merge base, the branch's creation in
// its reflog, else the base-like branch HEAD is fewest commits ahead of. What was found is kept per
// HEAD and set of refs, so a refresh asks git only for those
export function createBaseFinder(ask: GitAsk) {
  const found = new Map<string, Omit<BranchInfo, 'base'>>()

  // A name as git can use it: the local branch, else the remote's copy
  async function resolve(root: string, name: string): Promise<string | undefined> {
    if (!isBaseRef(name)) return undefined
    const local = name.startsWith('origin/') ? [] : [`refs/heads/${name}`]
    const remote = name.startsWith('origin/')
      ? `refs/remotes/${name}`
      : `refs/remotes/origin/${name}`
    for (const ref of [...local, remote]) {
      if (await ask(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])) {
        return ref.startsWith('refs/heads/') ? name : `origin/${branchName(name)}`
      }
    }
    return undefined
  }

  async function nearest(root: string, candidates: readonly string[]) {
    const measures = await Promise.all(
      candidates.map(async (name) => {
        const ahead = Number(await ask(root, ['rev-list', '--count', `${name}..HEAD`, '--']))
        const merge = await ask(root, ['merge-base', 'HEAD', name])
        const time = merge ? Number(await ask(root, ['show', '-s', '--format=%ct', merge])) : 0
        return merge && Number.isFinite(ahead) ? [{ name, ahead, mergeTime: time || 0 }] : []
      }),
    )
    return nearestBase(measures.flat())
  }

  async function detect(
    root: string,
    current: string | undefined,
    candidates: readonly string[],
  ): Promise<ReviewBase | undefined> {
    const base = (name: string | undefined, source: BaseSource) =>
      name === undefined ? undefined : { name, source }
    if (current !== undefined) {
      const vscode = await ask(root, ['config', '--get', `branch.${current}.vscode-merge-base`])
      const fromVscode = vscode ? await resolve(root, vscode) : undefined
      if (fromVscode) return base(fromVscode, 'vscode')
      const [own, head] = await Promise.all([
        ask(root, ['reflog', 'show', '--format=%gs', `refs/heads/${current}`, '--']),
        ask(root, ['reflog', 'show', '--format=%gs', '-n', String(HEAD_LOG_ENTRIES), 'HEAD', '--']),
      ])
      const start = createdFrom(current, lines(own), lines(head))
      const fromLog = start ? await resolve(root, start) : undefined
      if (fromLog) return base(fromLog, 'created')
    }
    return base(await nearest(root, candidates), 'nearest')
  }

  return {
    async find(root: string, head: string, chosen: string | undefined): Promise<BranchInfo> {
      const [current, remoteHead, refs] = await Promise.all([
        ask(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        ask(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']),
        ask(root, [
          'for-each-ref',
          '--format=%(refname:short)',
          'refs/heads',
          'refs/remotes/origin',
        ]),
      ])
      const key = [root, head, current, remoteHead, refs].join('\0')
      let known = found.get(key)
      if (known === undefined) {
        const remoteDefault = remoteHead ? branchName(remoteHead) : undefined
        const candidates = baseCandidates(lines(refs), remoteDefault, current)
        const onBase = current !== undefined && isOnBase(current, remoteDefault)
        const upstream = onBase
          ? await ask(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
          : undefined
        known = {
          found: onBase ? undefined : await detect(root, current, candidates),
          candidates,
          onBase,
          upstream: upstream || undefined,
        }
        if (found.size >= KEPT) found.delete(found.keys().next().value ?? '')
        found.set(key, known)
      }
      const picked = !known.onBase && chosen ? await resolve(root, chosen) : undefined
      return { ...known, base: picked ? { name: picked, source: 'chosen' } : known.found }
    },
  }
}
