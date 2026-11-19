import { displayPath } from '../panel/format.ts'

// The file's path as the header writes it: the folders in the muted color, the name in the foreground
export interface PathParts {
  readonly folders: readonly string[]
  readonly name: string
}

const partsOf = (path: string) => path.split(/[\\/]/).filter((part) => part !== '')

export const fileName = (path: string): string => partsOf(path).at(-1) ?? path

// From the tab's folder when the file is inside it, that folder's name first, as the project reads it;
// else the whole path with the home abbreviated
export function pathParts(path: string, cwd: string | undefined): PathParts {
  const parts = partsOf(path)
  const name = parts.at(-1) ?? path
  const folder = cwd === undefined ? [] : partsOf(cwd)
  const inside =
    folder.length > 0 &&
    folder.length < parts.length &&
    folder.every((part, index) => parts[index] === part)
  if (inside) return { folders: parts.slice(folder.length - 1, -1), name }
  const shown = partsOf(displayPath(path))
  const absolute = path.startsWith('/') && !displayPath(path).startsWith('~')
  const folders = shown.slice(0, -1)
  return { folders: absolute ? ['', ...folders] : folders, name }
}

// The name alone, or with its parent folder when another recent file has the same name
export function recentLabel(path: string, others: readonly string[]): string {
  const name = fileName(path)
  const repeated = others.some((other) => other !== path && fileName(other) === name)
  const parent = partsOf(path).at(-2)
  return repeated && parent ? `${parent}/${name}` : name
}
