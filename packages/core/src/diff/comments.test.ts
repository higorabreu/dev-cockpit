import { describe, expect, it } from 'vitest'
import {
  commentSpan,
  hunkLines,
  isOutdated,
  locateComment,
  locateComments,
  type ReviewComment,
  spanText,
} from './comments.ts'
import type { DiffFile } from './diff.ts'
import { parseUnifiedDiff } from './parse.ts'

// An invoice file whose hunk starts at a given line, with one removed and two added lines
const invoice = (start: number, timeout = '5000'): DiffFile => {
  const [file] = parseUnifiedDiff(
    [
      'diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts',
      '--- a/src/billing/invoice.ts',
      '+++ b/src/billing/invoice.ts',
      `@@ -${start},4 +${start},5 @@ export function total(invoice: Invoice) {`,
      ' const base = 1',
      '-const timeout = 3000',
      `+const timeout = ${timeout}`,
      '+const limit = 10',
      ' return base',
      ' }',
      '',
    ].join('\n'),
  )
  if (!file) throw new Error('invariant: the fixture parses')
  return file
}

const hunkOf = (file: DiffFile) => {
  const hunk = file.hunks[0]
  if (!hunk) throw new Error('invariant: the fixture has a hunk')
  return hunk
}

const comment = (file: DiffFile, from: number, to: number): ReviewComment => ({
  id: 'c1',
  path: file.path,
  lines: hunkLines(hunkOf(file), from, to),
  body: 'use the constant from config',
  place: { hunk: 0, start: Math.min(from, to) },
})

describe('hunkLines', () => {
  it('should give the lines in reading order when the range was picked from the bottom up', () => {
    // Arrange
    const hunk = hunkOf(invoice(10))

    // Act
    const lines = hunkLines(hunk, 3, 1)

    // Assert
    expect(lines.map((line) => line.text)).toEqual([
      'const timeout = 3000',
      'const timeout = 5000',
      'const limit = 10',
    ])
  })

  it('should stop at the edges of the hunk when the range goes past them', () => {
    const hunk = hunkOf(invoice(10))

    const lines = hunkLines(hunk, -2, 40)

    expect(lines).toHaveLength(hunk.lines.length)
  })
})

describe('commentSpan', () => {
  it('should name the new numbers when the lines exist in the new file', () => {
    const hunk = hunkOf(invoice(10))

    const span = commentSpan(hunkLines(hunk, 2, 3))

    expect(span).toEqual({ from: 11, to: 12, removed: false })
    expect(spanText(span)).toBe('11-12')
  })

  it('should name only the new numbers when a removed line sits among kept ones', () => {
    const hunk = hunkOf(invoice(10))

    const span = commentSpan(hunkLines(hunk, 0, 2))

    expect(span).toEqual({ from: 10, to: 11, removed: false })
  })

  it('should name the old numbers and say removed when every line was removed', () => {
    const hunk = hunkOf(invoice(10))

    const span = commentSpan(hunkLines(hunk, 1, 1))

    expect(span).toEqual({ from: 11, to: 11, removed: true })
    expect(spanText(span)).toBe('11')
  })
})

describe('locateComment', () => {
  it('should move a comment to the new numbers when its lines moved down', () => {
    // Arrange
    const before = comment(invoice(10), 2, 3)

    // Act
    const after = locateComment(before, invoice(14))

    // Assert
    expect(isOutdated(after)).toBe(false)
    expect(commentSpan(after.lines)).toEqual({ from: 15, to: 16, removed: false })
    expect(after.place).toEqual({ hunk: 0, start: 2 })
  })

  it('should mark a comment outdated and keep its numbers when its lines are gone', () => {
    const before = comment(invoice(10), 2, 3)

    const after = locateComment(before, invoice(10, '8000'))

    expect(isOutdated(after)).toBe(true)
    expect(commentSpan(after.lines)).toEqual({ from: 11, to: 12, removed: false })
    expect(after.body).toBe(before.body)
  })

  it('should mark a comment outdated when its file left the change', () => {
    const before = comment(invoice(10), 1, 1)

    const after = locateComment(before, undefined)

    expect(isOutdated(after)).toBe(true)
  })

  it('should make an outdated comment current again when its lines come back', () => {
    const outdated = locateComment(comment(invoice(10), 2, 2), invoice(10, '8000'))

    const back = locateComment(outdated, invoice(10))

    expect(isOutdated(back)).toBe(false)
    expect(back.place).toEqual({ hunk: 0, start: 2 })
  })

  it('should pick the match nearest the old numbers when the lines appear twice', () => {
    // Arrange
    const [file] = parseUnifiedDiff(
      [
        'diff --git a/src/a.ts b/src/a.ts',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -1,1 +1,2 @@',
        ' x',
        '+retry()',
        '@@ -40,1 +41,2 @@',
        ' y',
        '+retry()',
        '',
      ].join('\n'),
    )
    if (!file) throw new Error('invariant: the fixture parses')
    const near = file.hunks[1]
    if (!near) throw new Error('invariant: the fixture has two hunks')
    const before: ReviewComment = {
      id: 'c1',
      path: 'src/a.ts',
      lines: hunkLines(near, 1, 1),
      body: 'why again?',
      place: { hunk: 1, start: 1 },
    }

    // Act
    const after = locateComment(before, file)

    // Assert
    expect(after.place).toEqual({ hunk: 1, start: 1 })
  })
})

describe('locateComments', () => {
  it('should find each comment in the file with its path when a read brings several files', () => {
    const current = comment(invoice(10), 3, 3)
    const elsewhere: ReviewComment = { ...current, id: 'c2', path: 'src/billing/tax.ts' }

    const found = locateComments([current, elsewhere], [invoice(12)])

    expect(found.map(isOutdated)).toEqual([false, true])
    expect(found[0] && commentSpan(found[0].lines).from).toBe(14)
  })
})
