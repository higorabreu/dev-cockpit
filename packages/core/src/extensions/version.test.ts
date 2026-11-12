import { describe, expect, it } from 'vitest'
import { isVersion, isVersionRange, releaseOf, satisfies } from './version.ts'

describe('isVersion', () => {
  it.each(['0.3.0', '1.20.3', '2.0.0-beta.1'])('should accept %s when it is a version', (text) => {
    expect(isVersion(text)).toBe(true)
  })

  it.each(['1.2', 'v1.2.3', '1.2.x', ''])('should reject %s when it is not a version', (text) => {
    expect(isVersion(text)).toBe(false)
  })
})

describe('isVersionRange', () => {
  it('should accept a single comparator and a pair when they are well formed', () => {
    expect(isVersionRange('>=0.3.0')).toBe(true)
    expect(isVersionRange('>=0.3.0 <1.0.0')).toBe(true)
  })

  it.each(['^1.2.3', '>=1.2', 'latest', ''])(
    'should reject %s when it is not supported',
    (range) => {
      expect(isVersionRange(range)).toBe(false)
    },
  )
})

describe('satisfies', () => {
  it('should hold when the version is at or above a minimum', () => {
    expect(satisfies('0.3.0', '>=0.3.0')).toBe(true)
    expect(satisfies('0.10.0', '>=0.3.0')).toBe(true)
    expect(satisfies('0.2.9', '>=0.3.0')).toBe(false)
  })

  it('should require every comparator when the range has several', () => {
    expect(satisfies('0.9.0', '>=0.3.0 <1.0.0')).toBe(true)
    expect(satisfies('1.0.0', '>=0.3.0 <1.0.0')).toBe(false)
  })

  it('should match exactly when there is no operator', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true)
    expect(satisfies('1.2.4', '1.2.3')).toBe(false)
  })

  it('should ignore a pre-release suffix when comparing', () => {
    expect(satisfies('0.3.0-beta.1', '>=0.3.0')).toBe(true)
  })

  it('should fail closed when the version or the range is malformed', () => {
    expect(satisfies('not-a-version', '>=0.3.0')).toBe(false)
    expect(satisfies('0.3.0', 'whatever')).toBe(false)
  })
})

describe('releaseOf', () => {
  it('should drop the pre-release suffix when the version has one', () => {
    expect(releaseOf('0.3.0-beta.1')).toBe('0.3.0')
  })

  it('should be 0.0.0 when the text is not a version', () => {
    expect(releaseOf('next')).toBe('0.0.0')
  })
})
