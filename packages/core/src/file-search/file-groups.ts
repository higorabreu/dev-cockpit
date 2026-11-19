import { createFileMatcher, type FileMatcher, strictNameScore } from './file-match.ts'

// Rows drawn at most: the list is read by a person, past this they type more
export const FILE_ROWS = 100
// The ignored group under the project's matches, before "N more"
export const IGNORED_ROWS = 5
// A recent file climbs over files that match about as well
const RECENT_BONUS = 15

export interface FileRow {
  readonly path: string
  readonly ignored: boolean
  // A closed ignored folder: picking it steps into it
  readonly folder: boolean
}

export interface FileGroups {
  readonly project: readonly FileRow[]
  readonly ignored: readonly FileRow[]
  // Ignored matches left out of the group, reached by widening
  readonly more: number
  // The ignored group follows the fuzzy rule: widened by the user, or because the project matched nothing
  readonly loose: boolean
}

export interface FileSearchInput {
  readonly files: readonly string[]
  readonly ignored: readonly string[]
  // Paths relative to the root, most recent first; files the user opened stay findable, ignored or not
  readonly recent: readonly string[]
}

export const isClosedFolder = (path: string) => path.endsWith('/')

const row = (path: string, ignored: boolean): FileRow => ({
  path,
  ignored,
  folder: isClosedFolder(path),
})

// Inside a closed ignored folder of the listing, whose files git does not name one by one
const underClosed = (path: string, ignored: readonly string[]) =>
  ignored.some((entry) => isClosedFolder(entry) && path.startsWith(entry))

export interface FileSearch {
  // `widened` is the user's widening (the search key pressed again)
  groups(query: string, widened: boolean): FileGroups
}

// The project's files first, then the ignored ones apart, which show only when what is typed finds them
export function createFileSearch(input: FileSearchInput): FileSearch {
  const project = createFileMatcher(input.files)
  const ignoredMatcher = createFileMatcher(input.ignored)
  const ignoredSet = new Set(input.ignored)
  const bonus = new Map<number, number>()
  // Recent files git does not list as the project's: an ignored file opened before
  const extras: string[] = []
  // The recent files the listing knows, in their order, for the empty query
  const known: string[] = []
  for (const path of new Set(input.recent)) {
    const index = input.files.indexOf(path)
    if (index !== -1) bonus.set(index, RECENT_BONUS)
    else if (ignoredSet.has(path) || underClosed(path, input.ignored)) extras.push(path)
    else continue
    known.push(path)
  }
  const extrasMatcher = createFileMatcher(extras)
  const shownExtra = new Set(extras)
  const isIgnored = (path: string) => shownExtra.has(path)

  function empty(widened: boolean): FileGroups {
    const seen = new Set(known)
    const rows = known.map((path) => row(path, isIgnored(path)))
    for (const path of input.files) {
      if (rows.length >= FILE_ROWS) break
      if (!seen.has(path)) rows.push(row(path, false))
    }
    const ignored = widened
      ? input.ignored
          .filter((path) => !seen.has(path))
          .slice(0, FILE_ROWS)
          .map((path) => row(path, true))
      : []
    return { project: rows, ignored, more: 0, loose: widened }
  }

  function projectRows(query: string): FileRow[] {
    const files = project.rank(query, FILE_ROWS, bonus)
    const recent = extrasMatcher.rank(query, FILE_ROWS)
    const merged = [
      ...files.indices.map((index, at) => ({
        path: input.files[index] ?? '',
        ignored: false,
        score: files.scores[at] ?? 0,
      })),
      ...recent.indices.map((index, at) => ({
        path: extras[index] ?? '',
        ignored: true,
        score: (recent.scores[at] ?? 0) + RECENT_BONUS,
      })),
    ]
    if (recent.indices.length > 0) merged.sort((a, b) => b.score - a.score)
    return merged.slice(0, FILE_ROWS).map((entry) => row(entry.path, entry.ignored))
  }

  function looseIgnored(query: string): FileRow[] {
    const ranked = ignoredMatcher.rank(query, FILE_ROWS)
    return ranked.indices
      .map((index) => input.ignored[index] ?? '')
      .filter((path) => !shownExtra.has(path))
      .map((path) => row(path, true))
  }

  function strictIgnored(query: string): { rows: FileRow[]; total: number } {
    const found: { path: string; score: number }[] = []
    for (const path of input.ignored) {
      if (shownExtra.has(path)) continue
      const score = strictNameScore(query, path)
      if (score !== undefined) found.push({ path, score })
    }
    found.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    return {
      rows: found.slice(0, IGNORED_ROWS).map((entry) => row(entry.path, true)),
      total: found.length,
    }
  }

  return {
    groups(query, widened) {
      if (query.trim() === '') return empty(widened)
      const rows = projectRows(query)
      if (widened || rows.length === 0)
        return { project: rows, ignored: looseIgnored(query), more: 0, loose: true }
      const strict = strictIgnored(query)
      return {
        project: rows,
        ignored: strict.rows,
        more: strict.total - strict.rows.length,
        loose: false,
      }
    },
  }
}

// The deepest closed folder the query goes into ("node_modules/react/"), compared without case
export function folderToStep(query: string, closed: readonly string[]): string | undefined {
  const lower = new Map(closed.map((folder) => [folder.toLowerCase(), folder]))
  let found: string | undefined
  for (let end = query.indexOf('/'); end !== -1; end = query.indexOf('/', end + 1)) {
    const folder = lower.get(query.slice(0, end + 1).toLowerCase())
    if (folder !== undefined) found = folder
  }
  return found
}

// The inside of a closed folder, filtered by what is typed after it
export function stepRows(
  folder: string,
  entries: readonly string[],
  query: string,
): readonly FileRow[] {
  const inside = entries.filter((entry) => entry.startsWith(folder) && entry !== folder)
  const rest = query.slice(folder.length)
  if (rest.trim() === '') return inside.slice(0, FILE_ROWS).map((path) => row(path, true))
  const matcher: FileMatcher = createFileMatcher(inside.map((entry) => entry.slice(folder.length)))
  return matcher.rank(rest, FILE_ROWS).indices.map((index) => row(inside[index] ?? '', true))
}
