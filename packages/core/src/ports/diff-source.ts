import type { DiffFile, DiffScope, ReviewDiff } from '../diff/diff.ts'
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
  // The Unpushed scope found no upstream to compare with
  | { readonly kind: 'no-upstream'; readonly root: string }
  | { readonly kind: 'ok'; readonly diff: ReviewDiff }

// What changed in a repository, read only
export interface DiffSource {
  diff(request: DiffRequest): Promise<Result<DiffOutcome, ErrorBody>>
  // An untracked file a diff listed without its content, read as an addition; the path is from the root
  untrackedFile(
    root: string,
    path: string,
    ignoreWhitespace: boolean,
  ): Promise<Result<DiffFile, ErrorBody>>
  // The working tree text of a file of the repository, by line, to show the lines a diff left out
  fileLines(root: string, path: string): Promise<Result<readonly string[], ErrorBody>>
  // A short text that changes when anything a diff of the folder's repository shows may have changed
  // (HEAD, the status, the size or time of a changed file), far cheaper than the diff; undefined when it
  // cannot be read, so the caller keeps what it has
  fingerprint(cwd: string): Promise<string | undefined>
  // The top folder of the outermost repository holding a folder: a submodule's answers its superproject's,
  // so a file's path is written from the project the user opened; undefined outside a repository
  root(cwd: string): Promise<string | undefined>
}
