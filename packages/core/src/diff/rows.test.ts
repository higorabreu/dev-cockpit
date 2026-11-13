import { describe, expect, it } from 'vitest'
import type { DiffFile } from './diff.ts'
import { parseUnifiedDiff } from './parse.ts'
import { changedPairs, diffGaps, diffRows, gapSize } from './rows.ts'

// A 30-line file where lines 5 and 20 changed and line 25 was removed
const text = [
  'diff --git a/a.ts b/a.ts',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -4,3 +4,3 @@ function one() {',
  ' l4',
  '-l5',
  '+L5',
  ' l6',
  '@@ -19,3 +19,4 @@ function two() {',
  ' l19',
  '-l20',
  '+L20',
  '+extra',
  ' l21',
  '@@ -24,3 +25,2 @@',
  ' l24',
  '-l25',
  ' l26',
  '',
].join('\n')

const parsed = (): DiffFile => {
  const [file] = parseUnifiedDiff(text)
  if (!file) throw new Error('invariant: no file parsed')
  return { ...file, newLineCount: 30 }
}

const newText = Array.from({ length: 30 }, (_, index) => `n${index + 1}`)

describe('diffGaps', () => {
  it('should find the unchanged lines before, between and after the hunks when a file was modified', () => {
    const gaps = diffGaps(parsed())

    expect(gaps.map((gap) => [gap.id, gap.from, gap.to, gap.offset])).toEqual([
      [0, 1, 3, 0],
      [1, 7, 18, 0],
      [2, 23, 24, -1],
      [3, 27, 30, 0],
    ])
    expect(gaps.map(gapSize)).toEqual([3, 12, 2, 4])
  })

  it('should leave out the end when the length of the new file is unknown', () => {
    const { newLineCount: _unknown, ...file } = parsed()

    expect(diffGaps(file).map((gap) => gap.id)).toEqual([0, 1, 2])
  })

  it('should find no gap when the file was added', () => {
    expect(diffGaps({ ...parsed(), status: 'added' })).toEqual([])
  })

  it('should continue after a hunk that only removed lines when the next gap is placed', () => {
    const [file] = parseUnifiedDiff(
      ['diff --git a/b b/b', '--- a/b', '+++ b/b', '@@ -5,2 +4,0 @@', '-x', '-y', ''].join('\n'),
    )
    if (!file) throw new Error('invariant: no file parsed')

    const gaps = diffGaps({ ...file, newLineCount: 8 })

    expect(gaps.map((gap) => [gap.from, gap.to, gap.offset])).toEqual([
      [1, 4, 0],
      [5, 8, 2],
    ])
  })
})

describe('diffRows', () => {
  it('should carry each collapsed gap on the hunk below it and end with the last one when nothing is expanded', () => {
    const rows = diffRows(parsed(), new Set(), undefined)

    expect(rows.filter((row) => row.kind !== 'line').map((row) => row.kind)).toEqual([
      'hunk',
      'hunk',
      'hunk',
      'end',
    ])
    expect(rows.filter((row) => row.kind === 'line')).toHaveLength(12)
    expect(rows[0]).toMatchObject({ kind: 'hunk', hunk: 0, gap: { from: 1, to: 3 } })
  })

  it('should draw the unchanged lines with both numbers when a gap is expanded', () => {
    const rows = diffRows(parsed(), new Set([2]), newText)

    const context = rows.filter((row) => row.kind === 'context')

    expect(context).toEqual([
      { kind: 'context', old: 22, new: 23, text: 'n23' },
      { kind: 'context', old: 23, new: 24, text: 'n24' },
    ])
    const header = rows.find((row) => row.kind === 'hunk' && row.hunk === 2)
    expect(header).toMatchObject({ gap: undefined })
  })

  it('should keep a gap collapsed when its text is not loaded', () => {
    const rows = diffRows(parsed(), new Set([0]), undefined)

    expect(rows[0]).toMatchObject({ kind: 'hunk', gap: { id: 0 } })
  })

  it('should replace the end row with the last lines when that gap is expanded', () => {
    const rows = diffRows(parsed(), new Set([3]), newText)

    expect(rows.at(-1)).toEqual({ kind: 'context', old: 30, new: 30, text: 'n30' })
    expect(rows.some((row) => row.kind === 'end')).toBe(false)
  })
})

describe('changedPairs', () => {
  it('should pair each removed line with the added line in the same place when a block was replaced', () => {
    const file = parsed()

    expect(file.hunks.map(changedPairs)).toEqual([[[1, 2]], [[1, 2]], []])
  })
})
