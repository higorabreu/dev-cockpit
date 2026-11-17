import { describe, expect, it } from 'vitest'
import { extendSelection, isSelected, selectionTarget, selectLine } from './selection.ts'

describe('extendSelection', () => {
  it('should reach the clicked line when it is in the same hunk', () => {
    // Arrange
    const start = selectLine(0, 1, 4)

    // Act
    const range = extendSelection(start, 0, 1, 2, 8)

    // Assert
    expect(selectionTarget(range)).toEqual({ file: 0, hunk: 1, from: 2, to: 4 })
  })

  it('should stop at the last line of the hunk when the line is in a later hunk or file', () => {
    const start = selectLine(0, 1, 4)

    expect(extendSelection(start, 0, 2, 0, 8).focus).toBe(7)
    expect(extendSelection(start, 1, 0, 0, 8).focus).toBe(7)
  })

  it('should stop at the first line of the hunk when the line is in an earlier hunk', () => {
    const start = selectLine(0, 1, 4)

    expect(extendSelection(start, 0, 0, 3, 8).focus).toBe(0)
  })

  it('should keep the range inside the hunk when a key steps past its edge', () => {
    const start = selectLine(0, 0, 0)

    expect(extendSelection(start, 0, 0, -1, 3).focus).toBe(0)
    expect(extendSelection(start, 0, 0, 3, 3).focus).toBe(2)
  })
})

describe('isSelected', () => {
  it('should tell the lines inside the range from the others whichever way it was picked', () => {
    const range = { file: 0, hunk: 1, anchor: 5, focus: 3 }

    expect([2, 3, 4, 5, 6].map((line) => isSelected(range, 0, 1, line))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ])
    expect(isSelected(range, 0, 0, 4)).toBe(false)
    expect(isSelected(undefined, 0, 1, 4)).toBe(false)
  })
})
