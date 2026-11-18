import type { DiffFile, DiffModule } from './diff.ts'

const SUBPROJECT = /^Subproject commit ([0-9a-f]+)(-dirty)?$/

// The commits a submodule's entry in `git diff` names: the one the parent recorded at the scope's start
// (none for a new submodule) and the one checked out now (none for a deleted one)
export function subprojectCommits(file: DiffFile): {
  readonly old: string | undefined
  readonly new: string | undefined
} {
  let old: string | undefined
  let next: string | undefined
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const commit = SUBPROJECT.exec(line.text)?.[1]
      if (commit === undefined) continue
      if (line.kind === 'remove') old = commit
      else if (line.kind === 'add') next = commit
    }
  }
  return { old, new: next }
}

const inside = (path: string, folder: string) => path.startsWith(`${folder}/`)

// The submodule that holds another one: the longest other folder in front of its path
export function parentModule(path: string, modules: readonly string[]): string | undefined {
  let found: string | undefined
  for (const other of modules) {
    if (inside(path, other) && (found === undefined || other.length > found.length)) found = other
  }
  return found
}

// A file's path from the folder of the submodule that holds it, or its whole path
export const modulePath = (file: DiffFile) =>
  file.module === undefined ? file.path : file.path.slice(file.module.length + 1)

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// The submodules in the order the index shows them: by path, each one followed by those it holds
function depthFirst(modules: readonly DiffModule[]): DiffModule[] {
  const paths = modules.map((module) => module.path)
  const children = new Map<string | undefined, DiffModule[]>()
  for (const module of modules) {
    const parent = parentModule(module.path, paths)
    children.set(parent, [...(children.get(parent) ?? []), module])
  }
  const ordered: DiffModule[] = []
  const visit = (parent: string | undefined) => {
    for (const module of [...(children.get(parent) ?? [])].sort((a, b) => byPath(a.path, b.path))) {
      ordered.push(module)
      visit(module.path)
    }
  }
  visit(undefined)
  return ordered
}

// The repository's own files first, then each submodule's, depth first; by path inside each group. The
// diff reads in this order, so the index and the scroll agree
export function orderModuleFiles(
  files: readonly DiffFile[],
  modules: readonly DiffModule[],
): DiffFile[] {
  const rank = new Map(depthFirst(modules).map((module, index) => [module.path, index + 1]))
  const rankOf = (file: DiffFile) => (file.module === undefined ? 0 : (rank.get(file.module) ?? 0))
  return [...files].sort((a, b) => rankOf(a) - rankOf(b) || byPath(a.path, b.path))
}

// A row of the index: a submodule's header or a file, at its depth of nesting
export type IndexRow =
  | {
      readonly kind: 'module'
      readonly module: DiffModule
      readonly depth: number
      // Its files and those of the submodules inside it
      readonly count: number
      // The first of those files, where picking the header takes the diff
      readonly first: number | undefined
      readonly collapsed: boolean
    }
  | { readonly kind: 'file'; readonly file: number; readonly depth: number }

// The index of a change: the repository's own files, then a header per submodule with its files under it
// and the submodules it holds nested the same way; a collapsed header hides everything under it. The files
// are expected in the order of `orderModuleFiles`
export function indexRows(
  files: readonly DiffFile[],
  modules: readonly DiffModule[],
  collapsed: ReadonlySet<string>,
): IndexRow[] {
  const known = new Set(modules.map((module) => module.path))
  const own = new Map<string | undefined, number[]>()
  files.forEach((file, index) => {
    const group = file.module !== undefined && known.has(file.module) ? file.module : undefined
    own.set(group, [...(own.get(group) ?? []), index])
  })
  const ordered = depthFirst(modules)
  const paths = ordered.map((module) => module.path)
  const under = (module: DiffModule) =>
    files.flatMap((file, index) =>
      file.module === module.path || (file.module !== undefined && inside(file.module, module.path))
        ? [index]
        : [],
    )
  const rows: IndexRow[] = (own.get(undefined) ?? []).map((file) => ({
    kind: 'file',
    file,
    depth: 0,
  }))
  const visit = (parent: string | undefined, depth: number) => {
    for (const module of ordered) {
      if (parentModule(module.path, paths) !== parent) continue
      const all = under(module)
      const folded = collapsed.has(module.path)
      rows.push({
        kind: 'module',
        module,
        depth,
        count: all.length,
        first: all[0],
        collapsed: folded,
      })
      if (folded) continue
      for (const file of own.get(module.path) ?? [])
        rows.push({ kind: 'file', file, depth: depth + 1 })
      visit(module.path, depth + 1)
    }
  }
  visit(undefined, 0)
  return rows
}

// The row that stands for a file: its own, or the header of the outermost collapsed submodule that hides it
export function indexRowOf(
  rows: readonly IndexRow[],
  files: readonly DiffFile[],
  file: number,
): number {
  const own = rows.findIndex((row) => row.kind === 'file' && row.file === file)
  if (own >= 0) return own
  const module = files[file]?.module
  if (module === undefined) return -1
  return rows.findIndex(
    (row) =>
      row.kind === 'module' &&
      row.collapsed &&
      (row.module.path === module || inside(module, row.module.path)),
  )
}
