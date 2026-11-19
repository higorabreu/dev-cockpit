import { pathPieces, shortPath } from '@dck/core'

// The file's path as the header writes it: the folders in the muted color, the name in the foreground
export interface PathParts {
  readonly folders: readonly string[]
  readonly name: string
}

const partsOf = (path: string) => path.split(/[\\/]/).filter((part) => part !== '')

export const fileName = (path: string): string => partsOf(path).at(-1) ?? path

// From the project's folder when the file is inside it, that folder's name first, as the project reads
// it; else the whole path with the home abbreviated (`shortPath`)
export function pathParts(path: string, root: string | undefined): PathParts {
  const { folders, name } = pathPieces(shortPath(path, root))
  return { folders, name }
}

// The name alone, or with its parent folder when another recent file has the same name
export function recentLabel(path: string, others: readonly string[]): string {
  const name = fileName(path)
  const repeated = others.some((other) => other !== path && fileName(other) === name)
  const parent = partsOf(path).at(-2)
  return repeated && parent ? `${parent}/${name}` : name
}
