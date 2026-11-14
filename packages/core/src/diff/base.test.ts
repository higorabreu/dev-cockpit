import { describe, expect, it } from 'vitest'
import { baseCandidates, createdFrom, isBaseRef, MAX_BASE_CANDIDATES, rankBases } from './base.ts'

describe('createdFrom', () => {
  it('should read the start point from the oldest entry of the branch reflog', () => {
    const log = ['commit: second', 'commit: first', 'branch: Created from trunk']

    expect(createdFrom('feat/x', log, [])).toBe('trunk')
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
  it('should keep any branch name in the order of its last commit with the local copy in place of the remote one', () => {
    const refs = ['origin/staging', 'trunk', 'origin/trunk', 'origin/qa', 'dev', 'origin/dev']

    expect(baseCandidates(refs, 'feat/x', undefined)).toEqual([
      'origin/staging',
      'trunk',
      'origin/qa',
      'dev',
    ])
  })

  it('should put the local copy where the newer remote copy was when the remote moved on', () => {
    expect(baseCandidates(['origin/dev', 'feat/y', 'dev'], 'feat/x', undefined)).toEqual([
      'dev',
      'feat/y',
    ])
  })

  it('should leave out the current branch, its remote copy, its upstream and origin/HEAD', () => {
    const refs = ['feat/x', 'origin/HEAD', 'origin', 'origin/feat/x', 'origin/feat/x-review', 'dev']

    expect(baseCandidates(refs, 'feat/x', 'origin/feat/x-review')).toEqual(['dev'])
  })

  it('should drop names git could misread and cap the list', () => {
    const refs = Array.from({ length: 40 }, (_, index) => `release/${index}`)

    expect(baseCandidates(['-x', 'a..b', ...refs], undefined, undefined)).toHaveLength(
      MAX_BASE_CANDIDATES,
    )
    expect(baseCandidates(['-x', 'a..b', 'dev'], undefined, undefined)).toEqual(['dev'])
  })
})

describe('rankBases', () => {
  it('should put first the fewest commits ahead and break a tie by the latest merge base', () => {
    const measures = [
      { name: 'trunk', containsHead: false, ahead: 5, mergeTime: 300 },
      { name: 'dev', containsHead: false, ahead: 2, mergeTime: 100 },
      { name: 'staging', containsHead: false, ahead: 2, mergeTime: 200 },
    ]

    expect(rankBases(measures)).toEqual(['staging', 'dev', 'trunk'])
    expect(rankBases([])).toEqual([])
  })

  it('should never offer a candidate that already contains HEAD even when it is the closest', () => {
    const measures = [
      { name: 'feat/x-next', containsHead: true, ahead: 0, mergeTime: 0 },
      { name: 'dev', containsHead: false, ahead: 3, mergeTime: 100 },
    ]

    expect(rankBases(measures)).toEqual(['dev'])
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
