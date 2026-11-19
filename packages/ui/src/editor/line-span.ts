// Lines [start, endBefore) of the old text became lines [start, endAfter) of the new one; the lines
// around them are the same, so a reload rewrites only what changed and the cursor and scroll stay
export interface LineSpan {
  readonly start: number
  readonly endBefore: number
  readonly endAfter: number
}

export function changedSpan(before: readonly string[], after: readonly string[]): LineSpan {
  let start = 0
  const shorter = Math.min(before.length, after.length)
  while (start < shorter && before[start] === after[start]) start++
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }
  return { start, endBefore, endAfter }
}

const INDENT_PROBE_LINES = 200

// The file's own indentation when nothing says it: a tab if its indented lines start with one, else
// spaces by the smallest step found, two when none is
export function guessIndent(text: string): string {
  const lines = text.split('\n', INDENT_PROBE_LINES)
  let tabs = 0
  let spaces = 0
  let step = Number.POSITIVE_INFINITY
  for (const line of lines) {
    if (line.startsWith('\t')) tabs++
    const lead = /^ +(?=\S)/.exec(line)?.[0].length
    if (lead !== undefined) {
      spaces++
      if (lead >= 2) step = Math.min(step, lead)
    }
  }
  if (tabs > spaces) return '\t'
  return ' '.repeat(Number.isFinite(step) && step <= 8 ? step : 2)
}
