import {
  type BaseMeasure,
  type BaseSource,
  type BranchInfo,
  baseCandidates,
  branchName,
  createdFrom,
  isBaseRef,
  MAX_BASE_CANDIDATES,
  type ReviewBase,
  rankBases,
} from '@dck/core'
import { inBatches } from './git-run.ts'

// Answers a quick git command with its trimmed output, or undefined when it failed
export type GitAsk = (root: string, args: readonly string[]) => Promise<string | undefined>

// The HEAD reflog is long in an old clone; the move that created a branch is rarely this far back
const HEAD_LOG_ENTRIES = 2000
// Findings kept, one per repository, HEAD and refs; a few tabs on a few repositories fit
const KEPT = 16
// Candidates measured at once, each with up to three short git commands
const PARALLEL = 4

const lines = (text: string | undefined) => (text ? text.split('\n').filter(Boolean) : [])

// The branch the review compares with: the user's choice, VS Code's merge base, the branch's creation in
// its reflog, else the recently committed branch HEAD is fewest commits ahead of. No branch name is
// special: every team names its own. What was found is kept per HEAD and refs, so a refresh asks git
// only for those
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

  // How far HEAD is from a candidate; nothing for a branch with no history in common. A merge base
  // that is HEAD itself means the candidate already contains HEAD
  async function measure(root: string, head: string, name: string): Promise<BaseMeasure[]> {
    const merge = await ask(root, ['merge-base', 'HEAD', name])
    if (!merge) return []
    if (merge === head) return [{ name, containsHead: true, ahead: 0, mergeTime: 0 }]
    const [count, time] = await Promise.all([
      ask(root, ['rev-list', '--count', `${name}..HEAD`, '--']),
      ask(root, ['show', '-s', '--format=%ct', merge]),
    ])
    const ahead = Number(count)
    if (!count || !Number.isFinite(ahead)) return []
    return [{ name, containsHead: false, ahead, mergeTime: Number(time) || 0 }]
  }

  async function detect(
    root: string,
    current: string | undefined,
    nearest: string | undefined,
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
    return base(nearest, 'nearest')
  }

  return {
    async find(root: string, head: string, chosen: string | undefined): Promise<BranchInfo> {
      const [current, remoteHead, upstream, refs] = await Promise.all([
        ask(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        ask(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']),
        ask(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
        ask(root, [
          'for-each-ref',
          '--sort=-committerdate',
          `--count=${MAX_BASE_CANDIDATES}`,
          '--format=%(objectname) %(refname:short)',
          'refs/heads',
          'refs/remotes/origin',
        ]),
      ])
      const key = [root, head, current, remoteHead, upstream, refs].join('\0')
      let known = found.get(key)
      if (known === undefined) {
        const names = lines(refs).map((line) => line.slice(line.indexOf(' ') + 1))
        const listed = baseCandidates(names, current, upstream || undefined)
        const measures = await inBatches(listed, PARALLEL, (name) => measure(root, head, name))
        const candidates = rankBases(measures.flat())
        // The remote's default branch is where the others fork from: on it the nearest is only the
        // latest fork, not a base, so it is left to the user's pick
        const onDefault = current !== undefined && remoteHead === `origin/${current}`
        known = {
          found: await detect(root, current, onDefault ? undefined : candidates[0]),
          candidates,
          upstream: upstream || undefined,
        }
        if (found.size >= KEPT) found.delete(found.keys().next().value ?? '')
        found.set(key, known)
      }
      const picked = chosen ? await resolve(root, chosen) : undefined
      return { ...known, base: picked ? { name: picked, source: 'chosen' } : known.found }
    },
  }
}
