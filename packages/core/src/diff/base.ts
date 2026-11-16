// How the branch the review compares with was found, from the strongest sign to the weakest
export type BaseSource = 'chosen' | 'vscode' | 'created' | 'nearest'

export interface ReviewBase {
  // A local branch, or `origin/<name>` when only the remote has it
  readonly name: string
  readonly source: BaseSource
}

// What the review's base and unpushed scopes compare with in this repository
export interface BranchInfo {
  // What the base scope compares with: the user's choice, else what was found
  readonly base: ReviewBase | undefined
  // What was found without the user's choice, so picking it again goes back to finding it
  readonly found: ReviewBase | undefined
  // Branches HEAD may have started from, the nearest first, to pick another base from
  readonly candidates: readonly string[]
  // HEAD's upstream, like `origin/feat/login`, which the unpushed commits are counted against
  readonly upstream: string | undefined
}

export const noBranchInfo: BranchInfo = {
  base: undefined,
  found: undefined,
  candidates: [],
  upstream: undefined,
}

// The most recently committed branches looked at for a base; older ones are rarely where HEAD started
export const MAX_BASE_CANDIDATES = 30
export const MAX_BASE_REF = 255

// A branch name safe to hand to git as a revision: no option, no range, no reflog or path syntax
export function isBaseRef(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_BASE_REF &&
    /^[A-Za-z0-9._/-]+$/.test(name) &&
    !name.startsWith('-') &&
    !name.startsWith('/') &&
    !name.endsWith('/') &&
    !name.endsWith('.lock') &&
    !name.includes('..') &&
    !name.includes('//')
  )
}

const REMOTE = 'origin/'

// `origin/<name>` and `<name>` are the same branch for the review
export const branchName = (ref: string) => (ref.startsWith(REMOTE) ? ref.slice(REMOTE.length) : ref)

const shortRef = (ref: string) => ref.replace(/^refs\/(heads|remotes)\//, '')

// The branch this one was created from, by its reflogs (newest entry first, as `git reflog` prints).
// Its own reflog starts with "branch: Created from <ref>"; "Created from HEAD" says nothing by itself,
// so the HEAD reflog's first move onto the branch names where HEAD was. A ref that is the branch itself
// (a checkout of its remote copy) is not a base
export function createdFrom(
  branch: string,
  branchLog: readonly string[],
  headLog: readonly string[],
): string | undefined {
  const usable = (ref: string | undefined) => {
    if (ref === undefined || ref === 'HEAD' || /^[0-9a-f]{7,64}$/.test(ref)) return undefined
    const short = shortRef(ref)
    return branchName(short) === branch || !isBaseRef(short) ? undefined : short
  }
  const created = /^branch: Created from (.+)$/.exec(branchLog.at(-1) ?? '')?.[1]
  if (created !== undefined && created !== 'HEAD') return usable(created)
  const start = 'checkout: moving from '
  const end = ` to ${branch}`
  const moved = (subject: string) =>
    subject.startsWith(start) && subject.endsWith(end)
      ? subject.slice(start.length, -end.length)
      : undefined
  for (let index = headLog.length - 1; index >= 0; index--) {
    const from = moved(headLog[index] ?? '')
    if (from !== undefined) return usable(from)
  }
  return undefined
}

// The local and `origin/` branches that could be HEAD's base (short names, the most recently committed
// first, as `for-each-ref --sort=-committerdate` prints them), each once with the local copy in place of
// the remote one; never the current branch, its remote copy, HEAD's upstream or `origin/HEAD`
export function baseCandidates(
  refs: readonly string[],
  current: string | undefined,
  upstream: string | undefined,
): string[] {
  const best = new Map<string, string>()
  for (const ref of refs) {
    if (ref === 'origin/HEAD' || ref === 'origin' || ref === upstream || !isBaseRef(ref)) continue
    const name = branchName(ref)
    if (name === current) continue
    const known = best.get(name)
    if (known === undefined || (known.startsWith(REMOTE) && !ref.startsWith(REMOTE)))
      best.set(name, ref)
  }
  return [...best.values()].slice(0, MAX_BASE_CANDIDATES)
}

export interface BaseMeasure {
  readonly name: string
  // The candidate already has HEAD (it is HEAD or a descendant), so HEAD cannot have come from it
  readonly containsHead: boolean
  // Commits on HEAD that the candidate does not have
  readonly ahead: number
  // When HEAD and the candidate last met, in seconds since 1970
  readonly mergeTime: number
}

// The candidates HEAD can have come from, the one it left most recently first: the fewest commits
// ahead of it, then the latest merge base
export function rankBases(measures: readonly BaseMeasure[]): string[] {
  return measures
    .filter((measure) => !measure.containsHead)
    .sort((a, b) => a.ahead - b.ahead || b.mergeTime - a.mergeTime)
    .map((measure) => measure.name)
}
