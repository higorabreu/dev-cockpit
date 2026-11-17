// Characters a POSIX shell reads as part of a word; anything else needs quotes
const PLAIN = /^[\w@%+=:,./~-]+$/

// A path as a POSIX shell reads it: as is when it has nothing special, else in single quotes
export function shellQuote(path: string): string {
  return PLAIN.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`
}

// Paths typed into a terminal the way VTE types dropped files: quoted when needed, one space after
// each, so the next word or Enter follows naturally
export function pathsText(paths: readonly string[]): string {
  return paths.map((path) => `${shellQuote(path)} `).join('')
}

// The local paths of a text/uri-list; empty when an entry is not a local file (a web link), so the
// caller keeps the plain text instead
export function fileUriPaths(uriList: string): string[] {
  const entries = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  const paths: string[] = []
  for (const entry of entries) {
    const match = /^file:\/\/(localhost)?(\/[^?#]*)$/.exec(entry)
    if (!match?.[2]) return []
    try {
      paths.push(decodeURIComponent(match[2]))
    } catch {
      return []
    }
  }
  return paths
}

// What a paste types: files copied in a file manager become their paths, anything else is the text
export function pastedText(clipboard: { readonly uriList: string; readonly text: string }): string {
  const paths = fileUriPaths(clipboard.uriList)
  return paths.length > 0 ? pathsText(paths) : clipboard.text
}
