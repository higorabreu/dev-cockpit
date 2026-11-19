import { recordInteraction } from '../recency/recency.ts'
import { pathPieces, shortPath } from './short-path.ts'

// A few files per tab to switch between quickly, the open one included; paths only, never what they hold
export const MAX_RECENT_FILES = 5

// The opened file goes first, once
export const rememberFile = (recent: readonly string[], path: string): readonly string[] =>
  recordInteraction(recent, path, MAX_RECENT_FILES)

// A file that is gone or was closed leaves the list
export const forgetFile = (recent: readonly string[], path: string): readonly string[] =>
  recent.filter((entry) => entry !== path)

export interface RecentEntry {
  readonly path: string
  readonly name: string
  // Only when another file of the list has the same name: the fewest folders above it, from the short
  // path, that tell the two apart (`api` and `web`, or `acme/.vscode` and `~/.config/Code/User`)
  readonly folder?: string
}

const suffix = (folders: readonly string[], count: number) => folders.slice(-count).join('\0')

// The recent files as a menu names them: the name, and a folder beside the ones that share it
export function recentEntries(paths: readonly string[], root: string | undefined): RecentEntry[] {
  const pieces = paths.map((path) => ({ path, ...pathPieces(shortPath(path, root)) }))
  return pieces.map(({ path, name, folders, separator }) => {
    const twins = pieces.filter((other) => other.path !== path && other.name === name)
    if (twins.length === 0) return { path, name }
    let count = 1
    while (
      count < folders.length &&
      twins.some((other) => suffix(other.folders, count) === suffix(folders, count))
    )
      count += 1
    const shown = folders.slice(-count)
    // The root of an absolute path is its first folder, ''
    const folder = shown.length === 1 && shown[0] === '' ? separator : shown.join(separator)
    return { path, name, folder }
  })
}
