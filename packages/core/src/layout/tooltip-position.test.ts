import { describe, expect, it } from 'vitest'
import { placeTooltip } from './tooltip-position.ts'

const viewport = { width: 1000, height: 600 }
const tip = { width: 120, height: 28 }

describe('placeTooltip', () => {
  it('should sit below the element and align to its left edge when there is room', () => {
    const placement = placeTooltip({ x: 100, y: 100, width: 80, height: 20 }, tip, viewport)

    expect(placement).toEqual({ x: 100, y: 126, side: 'below' })
  })

  it('should move above the element when it does not fit below and there is room above', () => {
    const placement = placeTooltip({ x: 100, y: 570, width: 80, height: 20 }, tip, viewport)

    expect(placement.side).toBe('above')
    expect(placement.y).toBe(570 - 6 - 28)
  })

  it('should stay inside the right edge when the element is near it', () => {
    const placement = placeTooltip({ x: 980, y: 100, width: 15, height: 20 }, tip, viewport)

    expect(placement.x).toBe(1000 - 120 - 8)
  })

  it('should keep the margin on the left edge when the element starts outside it', () => {
    const placement = placeTooltip({ x: -20, y: 100, width: 40, height: 20 }, tip, viewport)

    expect(placement.x).toBe(8)
  })

  it('should stay below and pinned to the top margin when the window is smaller than the tooltip', () => {
    const placement = placeTooltip(
      { x: 10, y: 20, width: 40, height: 20 },
      { width: 100, height: 50 },
      { width: 400, height: 60 },
    )

    expect(placement.side).toBe('below')
    expect(placement.y).toBe(8)
  })
})
