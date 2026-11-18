import { describe, expect, it } from 'vitest'
import { compareSemver, isNewerVersion, isStable, parseSemver, type Semver } from './semver.ts'

const parsed = (text: string): Semver => {
  const version = parseSemver(text)
  if (!version) throw new Error(`invariant: ${text} is a version`)
  return version
}

describe('parseSemver', () => {
  it('should read the three numbers and no prerelease when the version is stable', () => {
    expect(parseSemver('0.10.0')).toEqual({ major: 0, minor: 10, patch: 0, prerelease: [] })
  })

  it('should drop the leading v when reading a release tag', () => {
    expect(parseSemver('v1.2.3')).toEqual(parseSemver('1.2.3'))
  })

  it('should split the prerelease into numbers and words when it has dots', () => {
    expect(parseSemver('1.0.0-rc.2')?.prerelease).toEqual(['rc', 2])
  })

  it('should ignore build metadata when reading the version', () => {
    expect(parseSemver('1.0.0+build.7')).toEqual(parseSemver('1.0.0'))
  })

  it.each(['1.2', '1.2.x', '01.2.3', '1.2.3-', 'latest', ''])(
    'should refuse %s when it is not a version',
    (text) => {
      expect(parseSemver(text)).toBeUndefined()
    },
  )
})

describe('compareSemver', () => {
  it('should order by number and not by text when a part has two digits', () => {
    expect(compareSemver(parsed('0.10.0'), parsed('0.9.0'))).toBeGreaterThan(0)
  })

  it.each([
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-alpha.beta', '1.0.0-beta'],
    ['1.0.0-beta', '1.0.0-beta.2'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0-beta.11', '1.0.0-rc.1'],
    ['1.0.0-rc.1', '1.0.0'],
  ])('should put %s before %s when following the semver precedence', (lower, higher) => {
    expect(compareSemver(parsed(lower), parsed(higher))).toBeLessThan(0)
    expect(compareSemver(parsed(higher), parsed(lower))).toBeGreaterThan(0)
  })

  it('should find no difference when only the build metadata differs', () => {
    expect(compareSemver(parsed('1.0.0+a'), parsed('1.0.0+b'))).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('should offer the release when it is newer than the running version', () => {
    expect(isNewerVersion('v0.10.0', '0.9.0')).toBe(true)
  })

  it('should offer nothing when the release is the same or older', () => {
    expect(isNewerVersion('0.9.0', '0.9.0')).toBe(false)
    expect(isNewerVersion('0.8.3', '0.9.0')).toBe(false)
  })

  it('should offer nothing when either side is not a version', () => {
    expect(isNewerVersion('nightly', '0.9.0')).toBe(false)
    expect(isNewerVersion('1.0.0', 'dev')).toBe(false)
  })
})

describe('isStable', () => {
  it('should tell a release from a prerelease when reading the version', () => {
    expect(isStable(parsed('1.0.0'))).toBe(true)
    expect(isStable(parsed('1.0.0-rc.1'))).toBe(false)
  })
})
