// How the branch the review compares with was found, from the strongest sign to the weakest
export type BaseSource = 'chosen' | 'vscode' | 'created' | 'nearest'

export interface ReviewBase {
  // A local branch, or `origin/<name>` when only the remote has it
  readonly name: string
  readonly source: BaseSource
}

// What the second scope of the review compares with in this repository
export interface BranchInfo {
  // What it compares with: the user's choice, else what was found
  readonly base: ReviewBase | undefined
  // What was found without the user's choice, so picking it again goes back to finding it
  readonly found: ReviewBase | undefined
  // Other bases worth offering, the remote's default first
  readonly candidates: readonly string[]
  // HEAD is on a base branch itself, so the second scope is what is not pushed to its upstream
  readonly onBase: boolean
  // HEAD's upstream, like `origin/main`, when it is on a base branch and has one
  readonly upstream: string | undefined
}

export const noBranchInfo: BranchInfo = {
  base: undefined,
  found: undefined,
  candidates: [],
  onBase: false,
  upstream: undefined,
}

export const MAX_BASE_CANDIDATES = 20
export const MAX_BASE_REF = 255

// Branches a feature usually starts from, in git flow and in trunk-based work alike
const BASE_NAME = /^(develop|main|master|release[/-].+)$/

export const isBaseName = (name: string) => BASE_NAME.test(name)

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

// `origin/develop` and `develop` are the same branch for the review
export const branchName = (ref: string) => (ref.startsWith(REMOTE) ? ref.slice(REMOTE.length) : ref)

// HEAD on the remote's default branch or on a base-like branch: there is no base to compare with
export function isOnBase(current: string, remoteDefault: string | undefined): boolean {
  return current === remoteDefault || isBaseName(current)
}

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

// Base-like branches among the local and `origin/` ones (short names, as `for-each-ref` prints them),
// each once, the local copy before the remote one; the remote's default first, the current branch out
export function baseCandidates(
  refs: readonly string[],
  remoteDefault: string | undefined,
  current: string | undefined,
): string[] {
  const best = new Map<string, string>()
  for (const ref of refs) {
    if (ref === 'origin/HEAD' || ref === 'origin' || !isBaseRef(ref)) continue
    const name = branchName(ref)
    if (name === current || !(isBaseName(name) || name === remoteDefault)) continue
    const known = best.get(name)
    if (known === undefined || known.startsWith(REMOTE)) best.set(name, ref)
  }
  const order = (name: string) =>
    name === remoteDefault
      ? 0
      : name === 'develop'
        ? 1
        : name === 'main'
          ? 2
          : name === 'master'
            ? 3
            : 4
  return [...best.keys()]
    .sort((a, b) => order(a) - order(b) || (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, MAX_BASE_CANDIDATES)
    .map((name) => best.get(name) ?? name)
}

export interface BaseMeasure {
  readonly name: string
  // Commits on HEAD that the candidate does not have
  readonly ahead: number
  // When HEAD and the candidate last met, in seconds since 1970
  readonly mergeTime: number
}

// The candidate HEAD left most recently: the fewest commits ahead of it, then the latest merge base
export function nearestBase(measures: readonly BaseMeasure[]): string | undefined {
  let best: BaseMeasure | undefined
  for (const measure of measures) {
    if (
      best === undefined ||
      measure.ahead < best.ahead ||
      (measure.ahead === best.ahead && measure.mergeTime > best.mergeTime)
    )
      best = measure
  }
  return best?.name
}
