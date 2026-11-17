import { describe, expect, it } from 'vitest'
import {
  fitRows,
  followSelection,
  listAnchor,
  listBand,
  listLimit,
  WHEEL_SIZE,
} from './list-fit.ts'

describe('listAnchor', () => {
  it('should open the list up, to the side, down and to the side when the wheel has four sectors', () => {
    // Arrange
    const sectors = [0, 1, 2, 3]

    // Act
    const openings = sectors.map((index) => listAnchor(index, 4).opening)

    // Assert
    expect(openings).toEqual(['up', 'side', 'down', 'side'])
  })

  it('should attach the list just outside the wheel when the sector is at the top', () => {
    const anchor = listAnchor(0, 4)

    expect(anchor.x).toBeCloseTo(WHEEL_SIZE / 2)
    expect(anchor.y).toBeLessThan(0)
  })
})

describe('listBand', () => {
  it('should end the band above the tab bar when the bar sits under the terminal', () => {
    // Arrange
    const bar = { top: 505, bottom: 540, height: 35 }

    // Act
    const band = listBand(bar, 540, 8)

    // Assert
    expect(band).toEqual({ top: 8, bottom: 497 })
  })

  it('should start the band under the tab bar when full screen puts the bar on top', () => {
    expect(listBand({ top: 0, bottom: 35, height: 35 }, 1080, 8)).toEqual({ top: 43, bottom: 1072 })
  })

  it('should use the whole window when the tab bar takes no room', () => {
    expect(listBand({ top: 0, bottom: 0, height: 0 }, 1080, 8)).toEqual({ top: 8, bottom: 1072 })
  })
})

describe('listLimit', () => {
  const band = { top: 8, bottom: 500 }

  it('should give an upward list the room between the band top and its anchor', () => {
    expect(listLimit('up', 120, band)).toBe(112)
  })

  it('should give a downward list the room between its anchor and the band bottom', () => {
    expect(listLimit('down', 420, band)).toBe(80)
  })

  it('should give a side list twice its shorter half when it is centered off the middle', () => {
    expect(listLimit('side', 200, band)).toBe(384)
  })
})

describe('followSelection', () => {
  it('should keep the window still when the selected row is already in it', () => {
    // Arrange
    const total = 7

    // Act
    const shown = followSelection(total, 3, 5, 0)

    // Assert
    expect(shown).toEqual({ start: 0, size: 5 })
  })

  it('should move the window by one row when the selection steps past its bottom edge', () => {
    expect(followSelection(7, 5, 5, 0)).toEqual({ start: 1, size: 5 })
  })

  it('should move the window by one row when the selection steps past its top edge', () => {
    expect(followSelection(7, 1, 5, 2)).toEqual({ start: 1, size: 5 })
  })

  it('should jump to the top when the selection wraps from the last row to the first', () => {
    expect(followSelection(7, 0, 5, 2)).toEqual({ start: 0, size: 5 })
  })

  it('should show every row from the first when they all fit', () => {
    expect(followSelection(4, 3, 9, 2)).toEqual({ start: 0, size: 4 })
  })

  it('should clamp a remembered start when the list got shorter', () => {
    expect(followSelection(6, 1, 4, 5)).toEqual({ start: 1, size: 4 })
  })
})

describe('fitRows', () => {
  // A list of rows 33 pixels apart inside 14 pixels of padding and border
  const measure = (rows: number, total: number, cues = 0) => ({
    total,
    rows,
    height: 14 + rows * 33 + cues,
    pitch: 33,
    cues,
  })

  it('should show every row when the whole list fits the limit', () => {
    // Arrange
    const limit = 14 + 7 * 33

    // Act
    const rows = fitRows(measure(7, 7), limit)

    // Assert
    expect(rows).toBe(7)
  })

  it('should leave room for the cues when the list is windowed', () => {
    expect(fitRows(measure(3, 7, 48), 14 + 5 * 33)).toBe(3)
  })

  it('should grow back to every row when the room comes back', () => {
    expect(fitRows(measure(3, 7, 48), 400)).toBe(7)
  })

  it('should keep one row when not even one fits', () => {
    expect(fitRows(measure(1, 7, 48), 20)).toBe(1)
  })

  it('should settle between the cues when it is measured again', () => {
    // Arrange
    const limit = 14 + 5 * 33
    const first = fitRows(measure(7, 7), limit)

    // Act
    const second = fitRows(measure(first, 7, 48), limit)

    // Assert
    expect(first).toBe(5)
    expect(second).toBe(3)
  })
})
