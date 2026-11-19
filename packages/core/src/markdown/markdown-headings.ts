const FENCE = /^ {0,3}(`{3,}|~{3,})/
const ATX = /^ {0,3}#{1,6}(\s|$)/
const SETEXT = /^ {0,3}(=+|-+)\s*$/
// A line that starts a block of its own, so the underline below it is no setext heading
const BLOCK = /^ {0,3}([>#*+-]|\d+[.)]\s|`{3}|~{3}|\|)/

// The lines (from 0) of the file's top level headings, in order, as the preview draws them: ATX (`# Title`)
// and setext (a line underlined with `===` or `---`), never inside a fenced code block. The preview and
// the editor keep the nearest heading in view when the user switches between them
export function headingLines(text: string): number[] {
  const lines = text.split(/\r?\n/)
  const found: number[] = []
  let fence: string | undefined
  // Where the paragraph the line belongs to starts: an underline turns the whole paragraph into a heading
  let paragraph: number | undefined
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') {
      paragraph = undefined
      continue
    }
    const marker = FENCE.exec(line)?.[1]
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length)
        fence = undefined
      continue
    }
    if (marker !== undefined) {
      fence = marker
      paragraph = undefined
      continue
    }
    if (ATX.test(line)) {
      found.push(index)
      paragraph = undefined
      continue
    }
    if (paragraph === undefined) {
      if (BLOCK.test(line)) continue
      paragraph = index
    }
    const next = lines[index + 1]
    if (next !== undefined && SETEXT.test(next)) {
      found.push(paragraph)
      paragraph = undefined
      lines[index + 1] = ''
    }
  }
  return found
}

// GitHub's anchor for a heading: lowercase, letters, digits, spaces, `-` and `_` kept, spaces to `-`,
// and `-1`, `-2` after a name already taken
export function headingSlug(text: string, taken: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
  const count = taken.get(base) ?? 0
  taken.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}
