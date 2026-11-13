import type { DiffScope, ReviewDiff } from '../diff/diff.ts'
import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'

export interface DiffRequest {
  // The tab's folder, anywhere inside the repository
  readonly cwd: string
  readonly scope: DiffScope
  readonly ignoreWhitespace: boolean
  // The base the user picked for this repository, instead of the one found
  readonly base?: string
}

export type DiffOutcome =
  | { readonly kind: 'not-repository' }
  // The Branch scope found no branch to compare with
  | { readonly kind: 'no-base'; readonly root: string }
  // On a base branch, the second scope has no upstream to compare with
  | { readonly kind: 'no-upstream'; readonly root: string }
  | { readonly kind: 'ok'; readonly diff: ReviewDiff }

// What changed in a repository, read only
export interface DiffSource {
  diff(request: DiffRequest): Promise<Result<DiffOutcome, ErrorBody>>
  // The working tree text of a file of the repository, by line, to show the lines a diff left out
  fileLines(root: string, path: string): Promise<Result<readonly string[], ErrorBody>>
}
