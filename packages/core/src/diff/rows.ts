import type { DiffFile, DiffHunk } from './diff.ts'

// Unchanged lines Git left out of a file's diff: before a hunk, or after the last one
export interface DiffGap {
  // The hunk it sits above, or the number of hunks for the one after the last
  readonly id: number
  // New line numbers, inclusive
  readonly from: number
  readonly to: number
  // Added to a new line number gives the old one; the lines are the same on both sides
  readonly offset: number
}

export type DiffRow =
  | { readonly kind: 'hunk'; readonly hunk: number; readonly gap: DiffGap | undefined }
  | { readonly kind: 'line'; readonly hunk: number; readonly line: number }
  | {
      readonly kind: 'context'
      readonly old: number
      readonly new: number
      readonly text: string
    }
  | { readonly kind: 'end'; readonly gap: DiffGap }

export const gapSize = (gap: DiffGap) => gap.to - gap.from + 1

// A hunk with no line on a side starts after the line its header names
const firstNew = (hunk: DiffHunk) => (hunk.newCount === 0 ? hunk.newStart + 1 : hunk.newStart)
const firstOld = (hunk: DiffHunk) => (hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart)

// Every stretch of unchanged lines the diff does not show, in order; empty ones are left out
export function diffGaps(file: DiffFile): readonly DiffGap[] {
  if (file.binary || file.status === 'added' || file.status === 'deleted') return []
  const gaps: DiffGap[] = []
  let shown = 0
  let offset = 0
  file.hunks.forEach((hunk, id) => {
    const start = firstNew(hunk)
    offset = firstOld(hunk) - start
    if (start - 1 > shown) gaps.push({ id, from: shown + 1, to: start - 1, offset })
    shown = start + hunk.newCount - 1
    offset = firstOld(hunk) + hunk.oldCount - (start + hunk.newCount)
  })
  const total = file.newLineCount
  if (total !== undefined && total > shown && file.hunks.length > 0) {
    gaps.push({ id: file.hunks.length, from: shown + 1, to: total, offset })
  }
  return gaps
}

// The rows a file draws: each hunk's header and lines, with a collapsed gap carried by the header below it
// (or by an end row) until it is expanded and its text is known
export function diffRows(
  file: DiffFile,
  expanded: ReadonlySet<number>,
  newText: readonly string[] | undefined,
): readonly DiffRow[] {
  const rows: DiffRow[] = []
  const gaps = new Map(diffGaps(file).map((gap) => [gap.id, gap]))
  const open = (gap: DiffGap | undefined) =>
    gap !== undefined && expanded.has(gap.id) && newText !== undefined && newText.length >= gap.to
  const unfold = (gap: DiffGap) => {
    for (let line = gap.from; line <= gap.to; line++) {
      rows.push({
        kind: 'context',
        old: line + gap.offset,
        new: line,
        text: newText?.[line - 1] ?? '',
      })
    }
  }
  file.hunks.forEach((hunk, index) => {
    const gap = gaps.get(index)
    if (gap && open(gap)) unfold(gap)
    rows.push({ kind: 'hunk', hunk: index, gap: gap && !open(gap) ? gap : undefined })
    hunk.lines.forEach((_line, line) => {
      rows.push({ kind: 'line', hunk: index, line })
    })
  })
  const end = gaps.get(file.hunks.length)
  if (end && open(end)) unfold(end)
  else if (end) rows.push({ kind: 'end', gap: end })
  return rows
}

// Removed lines followed by added ones are compared word by word, first with first, so only what changed
// inside a line is marked; the indexes are the hunk's lines
export function changedPairs(hunk: DiffHunk): readonly (readonly [number, number])[] {
  const pairs: (readonly [number, number])[] = []
  const { lines } = hunk
  let index = 0
  while (index < lines.length) {
    if (lines[index]?.kind !== 'remove') {
      index += 1
      continue
    }
    const removedStart = index
    while (lines[index]?.kind === 'remove') index += 1
    const addedStart = index
    while (lines[index]?.kind === 'add') index += 1
    const count = Math.min(addedStart - removedStart, index - addedStart)
    for (let step = 0; step < count; step++) {
      pairs.push([removedStart + step, addedStart + step])
    }
  }
  return pairs
}
