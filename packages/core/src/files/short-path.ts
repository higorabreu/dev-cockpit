// The home folder as the shell abbreviates it: /home/ana, /Users/ana or C:\Users\ana
const HOME = /^(?:\/(?:home|Users)\/[^/\\]+|[A-Za-z]:\\Users\\[^/\\]+)(?=$|[\\/])/
const SEPARATOR = /[\\/]/

const separatorOf = (path: string) => (path.includes('\\') && !path.includes('/') ? '\\' : '/')

// A Windows path names the same file whatever the case of its letters
const sameStart = (path: string, root: string) =>
  /^[A-Za-z]:\\/.test(root)
    ? path.slice(0, root.length).toLowerCase() === root.toLowerCase()
    : path.startsWith(root)

function inside(path: string, root: string): boolean {
  return (
    path.length > root.length && sameStart(path, root) && SEPARATOR.test(path[root.length] ?? '')
  )
}

// A file's path as the cockpit writes it: from the repository's folder, its name first, when the file is
// inside the tab's repository (the outer one, so a submodule's folder stays in the path); from `~` under
// the home; else whole. `root` is that repository's top folder, undefined outside one
export function shortPath(path: string, root: string | undefined): string {
  const top = root?.replace(/[\\/]+$/, '')
  const name = top?.split(SEPARATOR).at(-1)
  if (top && name && inside(path, top)) return `${name}${path.slice(top.length)}`
  const home = HOME.exec(path)
  return home ? `~${path.slice(home[0].length)}` : path
}

export interface PathPieces {
  // The folders above the name, as the short path writes them; an absolute path starts with ''
  readonly folders: readonly string[]
  readonly name: string
  readonly separator: '/' | '\\'
}

export function pathPieces(short: string): PathPieces {
  const parts = short.split(SEPARATOR)
  const name = parts.at(-1) ?? short
  return { folders: parts.slice(0, -1), name, separator: separatorOf(short) }
}
