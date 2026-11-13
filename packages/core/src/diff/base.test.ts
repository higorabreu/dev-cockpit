import { describe, expect, it } from 'vitest'
import {
  baseCandidates,
  createdFrom,
  isBaseRef,
  isOnBase,
  MAX_BASE_CANDIDATES,
  nearestBase,
} from './base.ts'

describe('createdFrom', () => {
  it('should read the start point from the oldest entry of the branch reflog', () => {
    const log = ['commit: second', 'commit: first', 'branch: Created from develop']

    expect(createdFrom('feat/x', log, [])).toBe('develop')
  })

  it('should keep a remote start point and drop the refs prefix', () => {
    expect(createdFrom('feat/x', ['branch: Created from refs/remotes/origin/develop'], [])).toBe(
      'origin/develop',
    )
  })

  it('should ask the HEAD reflog where HEAD was when the branch was created from HEAD', () => {
    const head = [
      'checkout: moving from feat/x to main',
      'commit: work',
      'checkout: moving from develop to feat/x',
      'checkout: moving from main to develop',
    ]

    expect(createdFrom('feat/x', ['commit: work', 'branch: Created from HEAD'], head)).toBe(
      'develop',
    )
  })

  it('should find nothing when the start point is a commit or the branch itself', () => {
    expect(createdFrom('feat/x', ['branch: Created from 3f2a9c1'], [])).toBeUndefined()
    expect(createdFrom('feat/x', ['branch: Created from origin/feat/x'], [])).toBeUndefined()
    expect(createdFrom('feat/x', [], ['checkout: moving from 3f2a9c1d to feat/x'])).toBeUndefined()
  })

  it('should find nothing when the reflogs say nothing about the creation', () => {
    expect(createdFrom('feat/x', ['commit (initial): first'], [])).toBeUndefined()
  })
})

describe('baseCandidates', () => {
  it('should offer each base-like branch once with the local copy first and the default on top', () => {
    const refs = [
      'feat/x',
      'main',
      'origin/HEAD',
      'origin/develop',
      'origin/main',
      'origin/release/2.1',
      'origin/trunk',
      'release-1.0',
    ]

    expect(baseCandidates(refs, 'trunk', 'feat/x')).toEqual([
      'origin/trunk',
      'origin/develop',
      'main',
      'origin/release/2.1',
      'release-1.0',
    ])
  })

  it('should leave out the current branch and cap the list', () => {
    const refs = Array.from({ length: 30 }, (_, index) => `release/${index}`)

    expect(baseCandidates(['main', ...refs], 'main', 'main')).not.toContain('main')
    expect(baseCandidates(refs, undefined, undefined)).toHaveLength(MAX_BASE_CANDIDATES)
  })
})

describe('nearestBase', () => {
  it('should pick the candidate with the fewest commits ahead and break a tie by the latest merge base', () => {
    const measures = [
      { name: 'main', ahead: 5, mergeTime: 300 },
      { name: 'develop', ahead: 2, mergeTime: 100 },
      { name: 'release/2.1', ahead: 2, mergeTime: 200 },
    ]

    expect(nearestBase(measures)).toBe('release/2.1')
    expect(nearestBase([])).toBeUndefined()
  })
})

describe('isOnBase', () => {
  it('should tell a base branch or the remote default from a feature branch', () => {
    expect(isOnBase('main', undefined)).toBe(true)
    expect(isOnBase('trunk', 'trunk')).toBe(true)
    expect(isOnBase('release/2.1', 'main')).toBe(true)
    expect(isOnBase('feat/x', 'main')).toBe(false)
  })
})

describe('isBaseRef', () => {
  it('should accept branch names and refuse options, ranges and odd syntax', () => {
    expect(['develop', 'origin/release/2.1', 'release-1.0'].every(isBaseRef)).toBe(true)
    expect(
      ['', '-x', '--output=a', 'a..b', 'HEAD@{1}', 'a b', 'main.lock', 'a//b', '/main', 'x/'].some(
        isBaseRef,
      ),
    ).toBe(false)
  })
})
