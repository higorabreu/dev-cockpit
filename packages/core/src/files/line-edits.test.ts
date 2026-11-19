import { describe, expect, it } from 'vitest'
import { editsByLine } from './line-edits.ts'
import { mergeThreeWay } from './merge.ts'

describe('editsByLine', () => {
  it('should give the lines of each merge edit when the text uses CRLF', () => {
    // Arrange
    const base = 'a\r\nb\r\nc\r\nd\r\n'
    const mine = 'a\r\nB\r\nc\r\nd\r\n'
    const disk = 'a\r\nb\r\nc\r\nD\r\n'
    const merged = mergeThreeWay(base, mine, disk)
    if (merged.kind !== 'merged') throw new Error('expected a merge')

    // Act
    const edits = editsByLine(mine, merged.edits)

    // Assert
    expect(edits).toEqual([{ fromLine: 3, toLine: 4, insert: 'D\r\n' }])
  })

  it('should place an edit after the last line when the text has no final line break', () => {
    expect(editsByLine('a\nb', [{ from: 3, to: 3, insert: 'c\n' }])).toEqual([
      { fromLine: 2, toLine: 2, insert: 'c\n' },
    ])
  })

  it('should refuse an edit that starts inside a line when it is not from the merge', () => {
    expect(() => editsByLine('abc\n', [{ from: 1, to: 2, insert: '' }])).toThrow('invariant')
  })
})
