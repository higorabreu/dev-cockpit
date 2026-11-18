import { describe, expect, it } from 'vitest'
import { formatBadge } from './badge.ts'

describe('formatBadge', () => {
  it('should show nothing when the count is zero', () => {
    expect(formatBadge(0)).toBeUndefined()
  })

  it('should show the number when it is between 1 and 9', () => {
    expect(formatBadge(1)).toBe('1')
    expect(formatBadge(9)).toBe('9')
  })

  it('should cap at 9+ when the count is 10 or more', () => {
    expect(formatBadge(10)).toBe('9+')
    expect(formatBadge(12)).toBe('9+')
    expect(formatBadge(1500)).toBe('9+')
  })
})
