import { describe, expect, it } from 'vitest'
import { createTimedMatcher } from './timed-matcher.ts'

describe('createTimedMatcher', () => {
  it('should tell a match from no match when the expression is quick', () => {
    const match = createTimedMatcher()

    expect(match(/^(feat|fix)\//, 'feat/add-login')).toBe('match')
    expect(match(/^(feat|fix)\//, 'add-login')).toBe('no-match')
  })

  it('should give up with a timeout when the expression backtracks without end', () => {
    const match = createTimedMatcher(50)
    const started = Date.now()

    const result = match(/^(a+)+$/, `${'a'.repeat(40)}!`)

    expect(result).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('should keep working when an earlier expression timed out', () => {
    const match = createTimedMatcher(50)
    match(/^(a+)+$/, `${'a'.repeat(40)}!`)

    expect(match(/^a+$/, 'aaa')).toBe('match')
  })
})
