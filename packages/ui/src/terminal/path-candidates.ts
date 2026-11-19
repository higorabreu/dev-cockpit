export interface PathCandidate {
  // As printed, without the line and column that follow it
  readonly path: string
  // Index in the line where the link starts, and where it ends (exclusive, `:12:5` or `(12,5)` included)
  readonly start: number
  readonly end: number
  // Where the line puts the cursor, both from 1, when it names a place in the file
  readonly line?: number
  readonly column?: number
}

const MAX_PATH_LENGTH = 1024
// What never belongs to a path printed bare: spaces, quotes, brackets, separators and colons
const STOP = '\\s"\'`()[\\]{}<>,;|=:'
// A drive letter may start a run (`C:\src`, `D:/x`); after it, a colon goes on only before a digit, so
// `a.ts:12:5` stays one run and `PATH=/a:/b` two. A folder written whole in parentheses or brackets, as
// Next.js names its route groups and parameters (`app/(auth)/[id]/page.tsx`), stays inside; any other
// bracket ends the run, so `Update(src/x.ts)` finds `src/x.ts`
const RUN = new RegExp(
  `(?:(?<![A-Za-z0-9])[A-Za-z]:(?=[\\\\/]))?(?:[^${STOP}]|:(?=\\d)|(?<=[\\\\/])\\([^${STOP}\\\\/]+\\)(?=[\\\\/])|(?<=[\\\\/])\\[[^${STOP}\\\\/]+\\](?=[\\\\/]))+`,
  'g',
)
// Any scheme with `//`; the web links addon owns the http ones and the rest are not files
const ADDRESS = /[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]*/gi
const TRAILING_PUNCTUATION = /[.!?]+$/
// `a.ts:12` and `a.ts:12:5`, as gcc, go, rustc, tsc --pretty, vitest, jest and pytest print them
const COLON_PLACE = /:(\d+)(?::(\d+))?$/
// Right after the path: `a.ts(12,5)` and `a.ts(12)`, as tsc and MSBuild print them
const PAREN_PLACE = /^\((\d+)(?:,\s?(\d+))?\)/
// After it, apart: Python's traceback (`File "a.py", line 12`) and ESLint's compact format
// (`a.ts: line 12, col 5, Error`)
const WORDED_PLACE = /^(?:["'`]?,\s+line\s+(\d+)|:\s+line\s+(\d+),\s+col\s+(\d+))/
const QUOTES = new Set(['"', "'", '`'])
const DRIVE = /^[A-Za-z]:[\\/]/
// A name with an extension that has a letter, so `1.5` or `v2.0` are not taken for files
const EXTENSION = /[^/\\.]\.(?=[0-9]*[A-Za-z])[A-Za-z0-9]{1,12}$/

function looksLikePath(path: string): boolean {
  if (path.startsWith('/')) return path.length > 1
  if (path.startsWith('~')) return path.startsWith('~/')
  if (DRIVE.test(path)) return path.length > 3
  return path.includes('/') || path.includes('\\') || EXTENSION.test(path)
}

const lineNumber = (text: string | undefined) => {
  const value = text === undefined ? 0 : Number(text)
  return value > 0 ? value : undefined
}

// The line and column the text right after a path names, and how much of it the link takes
function placeAfter(text: string): { line?: number; column?: number; length: number } {
  const paren = PAREN_PLACE.exec(text)
  if (paren) return place(paren[1], paren[2], paren[0].length)
  const worded = WORDED_PLACE.exec(text)
  if (worded) return place(worded[1] ?? worded[2], worded[3], 0)
  return { length: 0 }
}

function place(line: string | undefined, column: string | undefined, length: number) {
  const at = lineNumber(line)
  const col = at === undefined ? undefined : lineNumber(column)
  return {
    ...(at === undefined ? {} : { line: at }),
    ...(col === undefined ? {} : { column: col }),
    length,
  }
}

function candidate(text: string, start: number, linked: string): PathCandidate | undefined {
  const suffix = COLON_PLACE.exec(linked)
  const path = suffix ? linked.slice(0, suffix.index) : linked
  if (path.length > MAX_PATH_LENGTH || !looksLikePath(path)) return undefined
  const end = start + linked.length
  if (suffix) return { path, start, end, ...place(suffix[1], suffix[2], 0) }
  const { length, ...at } = placeAfter(text.slice(end))
  return { path, start, end: end + length, ...at }
}

// A quoted text with a space in it that looks like a path, as Python's traceback quotes it; a quote
// that opens nothing of the kind is passed over, so an apostrophe never swallows the path after it
function quotedCandidates(text: string): PathCandidate[] {
  const found: PathCandidate[] = []
  let at = 0
  while (at < text.length) {
    const quote = text[at] ?? ''
    const close = QUOTES.has(quote) ? text.indexOf(quote, at + 1) : -1
    const inside = close < 0 ? '' : text.slice(at + 1, close)
    const quoted = /\s/.test(inside) && !inside.includes('\n') && candidate(text, at + 1, inside)
    if (quoted && /\S/.test(inside[0] ?? '')) {
      found.push(quoted)
      at = close + 1
    } else at += 1
  }
  return found
}

function addressSpans(text: string): readonly (readonly [number, number])[] {
  return [...text.matchAll(ADDRESS)].map((match) => [match.index, match.index + match[0].length])
}

// Paths worth asking the disk about: absolute (a drive letter too), `~/`, or relative with a slash or an
// extension, with the line and column the line names after them; a quoted path may hold spaces
export function findPathCandidates(text: string): readonly PathCandidate[] {
  const addresses = addressSpans(text)
  const outside = ({ start, end }: PathCandidate, spans: readonly (readonly [number, number])[]) =>
    !spans.some(([from, to]) => start < to && end > from)
  const quoted = quotedCandidates(text).filter((found) => outside(found, addresses))
  const taken = quoted.map((found) => [found.start, found.end] as const)
  const found: PathCandidate[] = [...quoted]
  for (const match of text.matchAll(RUN)) {
    const linked = match[0].replace(TRAILING_PUNCTUATION, '')
    const run = candidate(text, match.index, linked)
    if (run && outside(run, addresses) && outside(run, taken)) found.push(run)
  }
  return found.sort((a, b) => a.start - b.start)
}
