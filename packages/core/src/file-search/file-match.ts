// Fuzzy matching of file paths, as quick open in editors does: the letters of the query in order, with
// points for word starts, runs of letters together and the file's own name

const SLASH = 47
const BACKSLASH = 92
const BOUNDARIES = new Set([SLASH, BACKSLASH, 95, 45, 46, 32]) // / \ _ - . and space

const MATCH = 1
const WORD_START = 6
const NAME_START = 6
const IN_NAME = 2
const RUN = 3
const GAP = 1
const NAME_ONLY = 10
const NAME_PREFIX = 20
const NAME_EXACT = 20

// ASCII only: a cheap test that runs for every letter of every path on each key
const isUpper = (code: number) => code >= 65 && code <= 90
const isLower = (code: number) => code >= 97 && code <= 122

// Where the name starts: after the last slash, a closed folder's own trailing slash left aside
export function nameStart(path: string): number {
  const end = path.endsWith('/') ? path.length - 2 : path.length - 1
  return path.lastIndexOf('/', end) + 1
}

// The file's name, or a closed folder's with its slash
export const nameOf = (path: string) => path.slice(nameStart(path))

// The folders above the name, without the last slash; empty for a file at the root
export function folderOf(path: string): string {
  const start = nameStart(path)
  return start === 0 ? '' : path.slice(0, start - 1)
}

function isWordStart(original: string, at: number): boolean {
  if (at === 0) return true
  const before = original.charCodeAt(at - 1)
  if (BOUNDARIES.has(before)) return true
  // camelCase: a capital right after a small letter
  return isUpper(original.charCodeAt(at)) && isLower(before)
}

// The query without spaces, and whether it is matched case for case (smart case: a capital asks for it)
export interface PreparedQuery {
  readonly text: string
  readonly sensitive: boolean
}

export function prepareQuery(query: string): PreparedQuery {
  const text = query.replace(/\s+/g, '')
  const sensitive = text !== text.toLowerCase()
  return { text: sensitive ? text : text.toLowerCase(), sensitive }
}

// One left to right pass from `from`; `startsFirst` takes a later word start over the next letter
function pass(
  hay: string,
  original: string,
  from: number,
  name: number,
  query: string,
  startsFirst: boolean,
): number | undefined {
  let score = 0
  let previous = -2
  let run = 0
  let at = from
  for (let index = 0; index < query.length; index++) {
    const char = query.charAt(index)
    let found = hay.indexOf(char, at)
    if (found === -1) return undefined
    if (startsFirst && found !== previous + 1 && !isWordStart(original, found)) {
      let start = hay.indexOf(char, found + 1)
      while (start !== -1 && !isWordStart(original, start)) start = hay.indexOf(char, start + 1)
      if (start !== -1) found = start
    }
    score += MATCH
    if (found === previous + 1) {
      run += 1
      score += RUN + run
    } else {
      run = 0
      if (previous >= 0) score -= GAP
    }
    if (isWordStart(original, found)) score += WORD_START
    if (found >= name) score += IN_NAME
    if (found === name) score += NAME_START
    previous = found
    at = found + 1
  }
  return score
}

// The name's part before its extension, a leading dot kept (".env" stays ".env")
function stemEnd(hay: string, name: number): number {
  const dot = hay.indexOf('.', name + 1)
  const slash = hay.endsWith('/') ? hay.length - 1 : hay.length
  return dot === -1 ? slash : Math.min(dot, slash)
}

// Scores a path against a prepared query; `lower` is the path in lowercase, given when already known
export function scorePath(
  query: PreparedQuery,
  path: string,
  lower: string = path.toLowerCase(),
): number | undefined {
  const text = query.text
  if (text === '') return 0
  const hay = query.sensitive ? path : lower
  const name = nameStart(path)
  const leftmost = pass(hay, path, 0, name, text, false)
  if (leftmost === undefined) return undefined
  const inName = pass(hay, path, name, name, text, true)
  // Matched inside the name, the word start pass over the folders rarely does better: one pass saved
  let best =
    inName === undefined
      ? Math.max(leftmost, pass(hay, path, 0, name, text, true) ?? leftmost)
      : Math.max(leftmost, inName + NAME_ONLY)
  if (hay.startsWith(text, name)) {
    best += NAME_PREFIX
    if (stemEnd(hay, name) === name + text.length) best += NAME_EXACT
  }
  return best
}

// The strict rule of ignored files: three letters or more, whole inside the name, a leading dot ignored on
// both sides, never scattered across the path; a higher score for a prefix and a shorter name
export function strictNameScore(query: string, path: string): number | undefined {
  const text = query.trim().replace(/^\.+/, '')
  if ([...text].length < 3 || /[\s/]/.test(text)) return undefined
  const name = nameOf(path).replace(/^\.+/, '').replace(/\/$/, '')
  const sensitive = text !== text.toLowerCase()
  const hay = sensitive ? name : name.toLowerCase()
  const found = hay.indexOf(sensitive ? text : text.toLowerCase())
  if (found === -1) return undefined
  return (found === 0 ? 1000 : 500) - name.length
}

export interface RankedFiles {
  // Indices into the matcher's paths, best first
  readonly indices: readonly number[]
  readonly scores: readonly number[]
  // How many paths matched, beyond the ones returned
  readonly total: number
}

export interface FileMatcher {
  readonly paths: readonly string[]
  // The best `limit` paths for the query; `bonus` adds points to some indices (recent files)
  rank(query: string, limit: number, bonus?: ReadonlyMap<number, number>): RankedFiles
}

// Keeps the best entries in order: score down, then shorter path, then the listing's order
function better(
  scoreA: number,
  lengthA: number,
  indexA: number,
  scoreB: number,
  lengthB: number,
  indexB: number,
) {
  return scoreA !== scoreB
    ? scoreA > scoreB
    : lengthA !== lengthB
      ? lengthA < lengthB
      : indexA < indexB
}

// A matcher over a fixed list. Each query typed on top of the previous one only looks at what that one
// matched, so typing stays cheap on a large repository
export function createFileMatcher(paths: readonly string[]): FileMatcher {
  let lowered: string[] | undefined
  let last: { text: string; sensitive: boolean; matched: Int32Array } | undefined

  const lower = (index: number) => {
    lowered ??= paths.map((path) => path.toLowerCase())
    return lowered[index] ?? ''
  }

  return {
    paths,
    rank(query, limit, bonus) {
      const prepared = prepareQuery(query)
      if (prepared.text === '') return { indices: [], scores: [], total: 0 }
      const narrows =
        last !== undefined &&
        last.sensitive === prepared.sensitive &&
        prepared.text.startsWith(last.text)
      const pool = narrows && last ? last.matched : undefined
      const count = pool ? pool.length : paths.length
      const matched = new Int32Array(count)
      let total = 0
      const indices: number[] = []
      const scores: number[] = []
      for (let at = 0; at < count; at++) {
        const index = pool ? (pool[at] ?? 0) : at
        const path = paths[index] ?? ''
        const found = scorePath(prepared, path, lower(index))
        if (found === undefined) continue
        matched[total++] = index
        const score = found + (bonus?.get(index) ?? 0)
        const full = indices.length >= limit
        const lastAt = indices.length - 1
        if (
          full &&
          !better(
            score,
            path.length,
            index,
            scores[lastAt] ?? 0,
            paths[indices[lastAt] ?? 0]?.length ?? 0,
            indices[lastAt] ?? 0,
          )
        )
          continue
        let place = full ? lastAt : indices.length
        while (
          place > 0 &&
          better(
            score,
            path.length,
            index,
            scores[place - 1] ?? 0,
            paths[indices[place - 1] ?? 0]?.length ?? 0,
            indices[place - 1] ?? 0,
          )
        )
          place -= 1
        if (full) {
          indices.pop()
          scores.pop()
        }
        indices.splice(place, 0, index)
        scores.splice(place, 0, score)
      }
      last = { ...prepared, matched: matched.subarray(0, total) }
      return { indices, scores, total }
    },
  }
}
