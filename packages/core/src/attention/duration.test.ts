import { describe, expect, it } from 'vitest'
import { formatDuration } from './duration.ts'

describe('formatDuration', () => {
  it('should show only seconds when under a minute', () => {
    expect(formatDuration(45_000)).toBe('45 s')
  })

  it('should show minutes and seconds when under an hour', () => {
    expect(formatDuration(112_000)).toBe('1 min 52 s')
  })

  it('should drop the seconds when the minutes are exact', () => {
    expect(formatDuration(120_000)).toBe('2 min')
  })

  it('should show hours and minutes when over an hour', () => {
    expect(formatDuration(7_380_000)).toBe('2 h 3 min')
  })

  it('should round to the nearest second when the value has milliseconds', () => {
    expect(formatDuration(1499)).toBe('1 s')
  })
})
