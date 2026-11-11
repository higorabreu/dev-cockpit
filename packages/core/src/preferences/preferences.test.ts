import { describe, expect, it } from 'vitest'
import {
  clampPanelWidth,
  FONT_SIZE,
  OPACITY,
  PANEL_WIDTH,
  readPreference,
  stepFontSize,
  stepOpacity,
} from './preferences.ts'

describe('stepOpacity', () => {
  it('should raise by one step when stepping up', () => {
    expect(stepOpacity(0.5, 1)).toBe(0.55)
  })

  it('should not accumulate floating point error when stepping repeatedly', () => {
    let value: number = OPACITY.initial
    for (let index = 0; index < 3; index++) value = stepOpacity(value, -1)

    expect(value).toBe(0.77)
  })

  it('should stop at the limits when stepping past them', () => {
    expect(stepOpacity(1, 1)).toBe(1)
    expect(stepOpacity(0.3, -1)).toBe(0.3)
  })
})

describe('stepFontSize', () => {
  it('should change by the delta when inside the range', () => {
    expect(stepFontSize(16, 1)).toBe(17)
    expect(stepFontSize(16, -1)).toBe(15)
  })

  it('should stop at the limits when stepping past them', () => {
    expect(stepFontSize(32, 1)).toBe(32)
    expect(stepFontSize(10, -1)).toBe(10)
  })
})

describe('readPreference', () => {
  it('should return the stored number when it is inside the range', () => {
    expect(readPreference('0.6', OPACITY)).toBe(0.6)
  })

  it('should return the initial value when nothing is stored', () => {
    expect(readPreference(null, FONT_SIZE)).toBe(16)
    expect(readPreference('  ', FONT_SIZE)).toBe(16)
  })

  it('should return the initial value when the stored text is not a number', () => {
    expect(readPreference('abc', OPACITY)).toBe(0.92)
  })

  it('should return the initial value when the stored number is out of range', () => {
    expect(readPreference('0.01', OPACITY)).toBe(0.92)
    expect(readPreference('99', FONT_SIZE)).toBe(16)
  })
})

describe('clampPanelWidth', () => {
  it('should keep the width when it is inside the range', () => {
    expect(clampPanelWidth(300)).toBe(300)
  })

  it('should stop at the limits when the width goes past them', () => {
    expect(clampPanelWidth(100)).toBe(PANEL_WIDTH.min)
    expect(clampPanelWidth(900)).toBe(PANEL_WIDTH.max)
  })

  it('should round to whole pixels when the width is fractional', () => {
    expect(clampPanelWidth(300.6)).toBe(301)
  })
})
