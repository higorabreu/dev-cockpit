import type { BranchInfo } from './base.ts'

// What the review compares with the working tree: HEAD, the merge base with the branch's base, or the
// merge base with HEAD's upstream (the commits not pushed yet)
export type DiffScope = 'uncommitted' | 'branch' | 'unpushed'

export type DiffLineKind = 'context' | 'add' | 'remove'

export interface DiffLine {
  readonly kind: DiffLineKind
  // Without the leading sign and without a trailing carriage return
  readonly text: string
  // Line numbers on each side; a removed line has no new one and an added line no old one
  readonly old: number | undefined
  readonly new: number | undefined
  // Git's "\ No newline at end of file" after this line
  readonly noNewline?: true
}

export interface DiffHunk {
  readonly oldStart: number
  readonly oldCount: number
  readonly newStart: number
  readonly newCount: number
  // The function or class Git reports after the second @@, often empty
  readonly section: string
  readonly lines: readonly DiffLine[]
}

export type DiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'

export interface DiffFile {
  // The new path, or the old one for a deleted file
  readonly path: string
  // Where a renamed or copied file came from
  readonly oldPath: string | undefined
  readonly status: DiffFileStatus
  // Set only when the mode changed, like 100644 and 100755
  readonly oldMode: string | undefined
  readonly newMode: string | undefined
  // Binary for Git, or text that is not UTF-8, which reads as binary here
  readonly binary: boolean
  readonly nonUtf8: boolean
  readonly submodule: boolean
  // Some line ends in CRLF
  readonly crlf: boolean
  // A lock file, a build output, a minified file or one marked `linguist-generated`
  readonly generated: boolean
  // Not tracked by Git yet, shown as added
  readonly untracked: boolean
  readonly additions: number
  readonly deletions: number
  readonly hunks: readonly DiffHunk[]
  // The size in bytes of a binary file, when known
  readonly size?: number
  // Too large to read: only its size is shown
  readonly omitted?: true
  // How many lines the new version has, so the unchanged lines after the last hunk can be shown
  readonly newLineCount?: number
  // The innermost submodule that holds the file, by its folder from the repository's top; the path is
  // from the top too
  readonly module?: string
  // An untracked file past the reading limit: listed, its content read only when asked
  readonly unloaded?: true
}

// A submodule whose changes the review shows inside it, as a group of its files
export interface DiffModule {
  // Its folder from the repository's top; a nested one starts with the folder of the one that holds it
  readonly path: string
  // The subjects of its new commits since the scope's start, newest first, at most MODULE_COMMITS
  readonly commits: readonly string[]
  // All of them, which can be more than the subjects
  readonly commitCount: number
}

// How many commit subjects a submodule carries; the rest is a count
export const MODULE_COMMITS = 10

export interface ReviewDiff {
  // The repository's top folder
  readonly root: string
  readonly scope: DiffScope
  // What the second scope compares with, found in either scope so the select can name it
  readonly branch: BranchInfo
  readonly files: readonly DiffFile[]
  // The submodules with changes, each holding the files whose `module` names it or a nested one
  readonly modules: readonly DiffModule[]
  readonly additions: number
  readonly deletions: number
}

export function reviewDiff(
  root: string,
  scope: DiffScope,
  branch: BranchInfo,
  files: readonly DiffFile[],
  modules: readonly DiffModule[] = [],
): ReviewDiff {
  let additions = 0
  let deletions = 0
  for (const file of files) {
    additions += file.additions
    deletions += file.deletions
  }
  return { root, scope, branch, files, modules, additions, deletions }
}

const LOCK_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
  'poetry.lock',
  'Pipfile.lock',
  'uv.lock',
  'go.sum',
  'mix.lock',
  'pubspec.lock',
  'flake.lock',
  'packages.lock.json',
])

// Lock files, build output and minified files are written by a tool, not read in a review
export function isGeneratedPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return (
    LOCK_FILES.has(name) ||
    /(^|\/)dist\//.test(path) ||
    /\.min\.(js|css|mjs)$/.test(name) ||
    /\.(js|css)\.map$/.test(name)
  )
}

// Past this many changed lines a file starts collapsed: reading it is rarely the point
export const LARGE_FILE_LINES = 2500

export type CollapseReason = 'generated' | 'large'

export function collapseReason(file: DiffFile): CollapseReason | undefined {
  if (file.generated) return 'generated'
  return file.additions + file.deletions > LARGE_FILE_LINES ? 'large' : undefined
}
