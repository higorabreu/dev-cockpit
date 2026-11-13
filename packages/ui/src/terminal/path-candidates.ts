export interface PathCandidate {
  // As printed, without the `:line[:col]` suffix
  readonly path: string
  // Index in the line where the link starts, and where it ends (exclusive, suffix included)
  readonly start: number
  readonly end: number
}

const MAX_PATH_LENGTH = 1024
// Quotes, brackets, separators and a colon not followed by a digit end a run: `Update(src/x.ts)`, `a:/b`
const RUN = /(?:[^\s"'`()[\]{}<>,;|=:]|:(?=\d))+/g
// Any scheme with `//`; the web links addon owns the http ones and the rest are not files
const ADDRESS = /[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]*/gi
const TRAILING_PUNCTUATION = /[.!?]+$/
const LINE_SUFFIX = /(?::\d+){1,2}$/
// A name with an extension that has a letter, so `1.5` or `v2.0` are not taken for files
const EXTENSION = /[^/.]\.(?=[0-9]*[A-Za-z])[A-Za-z0-9]{1,12}$/

function looksLikePath(path: string): boolean {
  if (path.startsWith('/')) return path.length > 1
  if (path.startsWith('~')) return path.startsWith('~/')
  return path.includes('/') || EXTENSION.test(path)
}

function addressSpans(text: string): readonly (readonly [number, number])[] {
  return [...text.matchAll(ADDRESS)].map((match) => [match.index, match.index + match[0].length])
}

// Paths worth asking the disk about: absolute, `~/`, or relative with a slash or an extension
export function findPathCandidates(text: string): readonly PathCandidate[] {
  const addresses = addressSpans(text)
  const insideAddress = (start: number, end: number) =>
    addresses.some(([from, to]) => start < to && end > from)
  const found: PathCandidate[] = []
  for (const match of text.matchAll(RUN)) {
    const linked = match[0].replace(TRAILING_PUNCTUATION, '')
    const path = linked.replace(LINE_SUFFIX, '')
    const start = match.index
    const end = start + linked.length
    if (path.length > MAX_PATH_LENGTH || !looksLikePath(path)) continue
    if (!insideAddress(start, end)) found.push({ path, start, end })
  }
  return found
}
