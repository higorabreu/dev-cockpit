import type {
  FileFinder,
  FileListing,
  FolderWalk,
  GitFiles,
  WalkLimits,
} from '../ports/project-files.ts'

// Folders that tools generate, never walked outside a repository
export const GENERATED_FOLDERS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.venv',
  '__pycache__',
] as const

// Outside a repository: the first files found, within a time any search can wait
export const FOLDER_LIMITS: WalkLimits = {
  maxEntries: 20_000,
  timeoutMs: 2000,
  skip: GENERATED_FOLDERS,
}

// One step into a closed ignored folder: two levels, quickly, on demand
export const STEP_LIMITS: WalkLimits = { maxEntries: 2000, timeoutMs: 300, maxDepth: 2 }

export interface FileFinderDependencies {
  readonly git: GitFiles
  readonly walk: FolderWalk
}

// Git's view of the repository when there is one, else a bounded walk of the folder
export function createFileFinder(dependencies: FileFinderDependencies): FileFinder {
  const { git, walk } = dependencies
  return {
    async list(cwd): Promise<FileListing> {
      const tracked = await git.tracked(cwd)
      if (tracked) return { kind: 'git', ...tracked, ignored: [], partial: true }
      const found = await walk.walk(cwd, '', FOLDER_LIMITS)
      return {
        kind: 'folder',
        root: cwd,
        files: found.entries.filter((entry) => !entry.endsWith('/')),
        ignored: [],
        truncated: found.truncated,
        partial: false,
      }
    },
    others: (root) => git.others(root),
    expand: (root, folder) => walk.walk(root, folder, STEP_LIMITS),
  }
}

// A path of a listing on disk, with the root's own separator
export function absolutePath(root: string, path: string): string {
  const windows = root.includes('\\') && !root.includes('/')
  const separator = windows ? '\\' : '/'
  const relative = windows ? path.replaceAll('/', '\\') : path
  return root.endsWith(separator) ? `${root}${relative}` : `${root}${separator}${relative}`
}

// A path on disk as a listing of the root names it; undefined when it is outside the root
export function relativePath(root: string, path: string): string | undefined {
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  const base = root.endsWith(separator) ? root : `${root}${separator}`
  if (!path.startsWith(base) || path.length === base.length) return undefined
  return path.slice(base.length).replaceAll('\\', '/')
}
