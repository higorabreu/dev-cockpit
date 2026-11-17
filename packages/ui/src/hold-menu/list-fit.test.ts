import { describe, expect, it } from 'vitest'
import {
  COMPACT_WHEEL,
  fitRows,
  followSelection,
  listAnchor,
  listBand,
  listLimit,
  placeWheel,
  WHEEL_SIZE,
  wheelSize,
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

describe('wheelSize', () => {
  it('should keep the full wheel when the band is tall', () => {
    expect(wheelSize({ top: 8, bottom: 497 })).toBe(WHEEL_SIZE)
  })

  it('should draw the compact wheel when the band is short', () => {
    expect(wheelSize({ top: 8, bottom: 334 })).toBe(COMPACT_WHEEL)
  })

  it('should shrink the wheel to the band when not even the compact one fits', () => {
    expect(wheelSize({ top: 8, bottom: 148 })).toBe(140)
  })
})

describe('placeWheel', () => {
  // Seven rows of 33 pixels in a list with a 12 pixel frame, measured with every row on screen
  const seven = { total: 7, rows: 7, height: 243, pitch: 33, cues: 0 }

  it('should keep the wheel centered when its list fits there', () => {
    // Arrange
    const band = { top: 8, bottom: 1072 }

    // Act
    const placement = placeWheel(0, 4, band, seven)

    // Assert
    expect(placement.layout).toEqual({ size: WHEEL_SIZE, top: 442, overlap: 0 })
    expect(placement.rows).toBe(7)
  })

  it('should move the wheel down only as far as the list above it needs', () => {
    const placement = placeWheel(0, 4, { top: 8, bottom: 497 }, seven)

    expect(placement.layout.top).toBe(263)
    expect(placement.rows).toBe(7)
  })

  it('should move the wheel up when the list opens below it', () => {
    const placement = placeWheel(2, 4, { top: 8, bottom: 497 }, seven)

    expect(placement.layout.top).toBe(46)
    expect(placement.rows).toBe(7)
  })

  it('should keep the wheel inside the band and window the list when even moving is not enough', () => {
    // Measured with every row on screen, before the cues take their room
    const placement = placeWheel(0, 4, { top: 8, bottom: 334 }, seven)

    expect(placement.layout).toEqual({ size: COMPACT_WHEEL, top: 170, overlap: 0 })
    expect(placement.rows).toBe(4)
  })

  it('should keep a pinned wheel still and fit the list to the room it has there', () => {
    const placement = placeWheel(0, 4, { top: 8, bottom: 497 }, seven, 150)

    expect(placement.layout.top).toBe(150)
    expect(placement.rows).toBe(3)
  })

  it('should keep the list off the wheel when one row fits above it', () => {
    const placement = placeWheel(0, 4, { top: 8, bottom: 280 }, seven)

    expect(placement.layout.overlap).toBe(0)
    expect(placement.rows).toBeGreaterThanOrEqual(1)
  })

  it('should lay the list over part of the wheel when not one row fits above it', () => {
    // Arrange: the compact wheel at the bottom of the band leaves 46 pixels above it
    const band = { top: 8, bottom: 230 }

    // Act
    const placement = placeWheel(0, 4, band, seven)

    // Assert: one row between the cues takes 93 pixels with this frame
    expect(placement.layout).toEqual({ size: COMPACT_WHEEL, top: 66, overlap: 47 })
    expect(placement.rows).toBe(1)
  })

  it('should keep a short list off the wheel when it fits whole above it', () => {
    const one = { total: 1, rows: 1, height: 45, pitch: 33, cues: 0 }

    const placement = placeWheel(0, 4, { top: 8, bottom: 250 }, one)

    expect(placement.layout.overlap).toBe(0)
    expect(placement.rows).toBe(1)
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
