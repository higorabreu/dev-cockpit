import { describe, expect, it } from 'vitest'
import {
  canPan,
  clampPlacement,
  decodeSize,
  fitPlacement,
  fitScale,
  MAX_SCALE,
  stepScale,
  zoomAt,
} from './image-fit.ts'

const photo = { width: 4000, height: 3000 }
const view = { width: 800, height: 500 }

describe('decodeSize', () => {
  it('should cap the long side when the image is larger than the cap', () => {
    expect(decodeSize(photo, 2048, false)).toEqual({ width: 2048, height: 1536 })
    expect(decodeSize({ width: 1000, height: 6000 }, 2048, false)).toEqual({
      width: 341,
      height: 2048,
    })
  })

  it('should keep a small image at its own size when it is a bitmap', () => {
    expect(decodeSize({ width: 64, height: 32 }, 2048, false)).toEqual({ width: 64, height: 32 })
  })

  it('should draw a vector image at the full cap when it is an SVG', () => {
    expect(decodeSize({ width: 24, height: 12 }, 2048, true)).toEqual({ width: 2048, height: 1024 })
  })
})

describe('fitScale', () => {
  it('should shrink a large image to the view and never grow a small one', () => {
    expect(fitScale(photo, view)).toBeCloseTo(500 / 3000)
    expect(fitScale({ width: 100, height: 50 }, view)).toBe(1)
  })
})

describe('stepScale', () => {
  it('should step to the next scale up or down from any scale, fit included', () => {
    expect(stepScale(1, 1)).toBe(1.25)
    expect(stepScale(1, -1)).toBe(0.75)
    expect(stepScale(0.1667, 1)).toBe(0.25)
    expect(stepScale(0.1667, -1)).toBe(0.1)
  })

  it('should stay within the limits when the scale is at an end', () => {
    expect(stepScale(MAX_SCALE, 1)).toBe(MAX_SCALE)
    expect(stepScale(0.1, -1)).toBe(0.1)
    expect(stepScale(0.05, -1)).toBe(0.05)
  })
})

describe('placement', () => {
  it('should center the image when it fits the view', () => {
    const placement = fitPlacement(photo, view)

    expect(placement.x).toBeCloseTo((800 - 4000 * placement.scale) / 2)
    expect(placement.y).toBeCloseTo(0)
    expect(canPan(placement, photo, view)).toBe(false)
  })

  it('should keep a larger image from leaving a gap when it is panned too far', () => {
    expect(clampPlacement({ scale: 1, x: 200, y: -9000 }, photo, view)).toEqual({
      scale: 1,
      x: 0,
      y: -2500,
    })
    expect(canPan({ scale: 1, x: 0, y: 0 }, photo, view)).toBe(true)
  })

  it('should keep the point under the pointer still when it zooms there', () => {
    // Arrange
    const start = { scale: 1, x: -1000, y: -1000 }
    const pointer = { x: 400, y: 250 }

    // Act
    const next = zoomAt(start, 2, pointer, photo, view)

    // Assert: the image's point under the pointer was (1400, 1250) and still is
    expect((pointer.x - next.x) / next.scale).toBeCloseTo(1400)
    expect((pointer.y - next.y) / next.scale).toBeCloseTo(1250)
  })

  it('should not zoom past the largest scale when asked for more', () => {
    expect(zoomAt({ scale: 8, x: 0, y: 0 }, 12, { x: 0, y: 0 }, photo, view).scale).toBe(8)
  })
})
