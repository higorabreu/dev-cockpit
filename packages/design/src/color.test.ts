import { describe, expect, it } from 'vitest'
import { contrastRatio, mix, parseHex, relativeLuminance } from './color.ts'

describe('parseHex', () => {
  it('should return the channels when the color is a valid hex', () => {
    const color = '#1b2c3d'

    const result = parseHex(color)

    expect(result).toEqual([27, 44, 61])
  })

  it('should reject the color when it is not a six digit hex', () => {
    expect(() => parseHex('#fff')).toThrow()
    expect(() => parseHex('rgb(0, 0, 0)')).toThrow()
  })
})

describe('contrastRatio', () => {
  it('should be 21 when comparing black and white', () => {
    const black = parseHex('#000000')
    const white = parseHex('#ffffff')

    const result = contrastRatio(black, white)

    expect(result).toBeCloseTo(21, 5)
  })

  it('should be 1 when both colors are the same', () => {
    const color = parseHex('#6a6a6a')

    const result = contrastRatio(color, color)

    expect(result).toBeCloseTo(1, 5)
  })

  it('should not depend on the order of the colors when comparing', () => {
    const a = parseHex('#767676')
    const b = parseHex('#ffffff')

    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
  })

  it('should match the published WCAG value when comparing the classic gray on white', () => {
    const gray = parseHex('#767676')
    const white = parseHex('#ffffff')

    const result = contrastRatio(gray, white)

    expect(result).toBeCloseTo(4.54, 2)
  })
})

describe('mix', () => {
  it('should return the background when the foreground share is zero', () => {
    const result = mix(parseHex('#ffffff'), parseHex('#102030'), 0)

    expect(result).toEqual([16, 32, 48])
  })

  it('should return the foreground when the share is one', () => {
    const result = mix(parseHex('#ffffff'), parseHex('#102030'), 1)

    expect(result).toEqual([255, 255, 255])
  })

  it('should blend proportionally when the share is in between', () => {
    const result = mix(parseHex('#ffffff'), parseHex('#000000'), 0.5)

    expect(result).toEqual([128, 128, 128])
  })
})

describe('relativeLuminance', () => {
  it('should be zero for black and one for white', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0)
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10)
  })
})
