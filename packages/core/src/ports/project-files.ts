// Paths in this port are relative to a root, with / between folders whatever the system; a folder that
// was not entered ends with /

// The tracked files of a repository, those of its submodules included, from its top folder. Git reads
// them from its index at once; the other files need a walk of the tree, so they come apart
export interface GitTracked {
  readonly root: string
  readonly files: readonly string[]
  // More files than the cap: the first ones are kept
  readonly truncated: boolean
}

// The files of the tree git does not track
export interface GitOthers {
  // Untracked files no ignore rule takes
  readonly files: readonly string[]
  // Ignored files one by one, and each wholly ignored folder once, closed
  readonly ignored: readonly string[]
  readonly truncated: boolean
}

export interface GitFiles {
  // Undefined when the folder is not inside a repository or git cannot answer
  tracked(cwd: string): Promise<GitTracked | undefined>
  // Of a repository's top folder; empty when git cannot answer in time
  others(root: string): Promise<GitOthers>
}

export interface WalkLimits {
  readonly maxEntries: number
  readonly timeoutMs: number
  // Levels entered below the start; a folder at the last level is named closed instead of entered
  readonly maxDepth?: number
  // Folder names never entered nor named, wherever they are
  readonly skip?: readonly string[]
}

export interface WalkResult {
  readonly entries: readonly string[]
  // Stopped by the entry cap or the time limit: what was found first is kept
  readonly truncated: boolean
}

// A bounded walk of a folder that never follows a symbolic link to a folder
export interface FolderWalk {
  // From `from`, relative to the root ('' for the root itself); entries are relative to the root
  walk(root: string, from: string, limits: WalkLimits): Promise<WalkResult>
}

// What the file search lists for a tab's folder: git's view of its repository, or a walk outside one
export interface FileListing {
  readonly kind: 'git' | 'folder'
  readonly root: string
  readonly files: readonly string[]
  // Always empty outside a repository
  readonly ignored: readonly string[]
  readonly truncated: boolean
  // A repository's tracked files came first; `FileFinder.others` brings the rest
  readonly partial: boolean
}

export interface FileFinder {
  list(cwd: string): Promise<FileListing>
  // The untracked and ignored files of a partial listing's root
  others(root: string): Promise<GitOthers>
  // The inside of a closed ignored folder of a listing, two levels at a time
  expand(root: string, folder: string): Promise<WalkResult>
}
