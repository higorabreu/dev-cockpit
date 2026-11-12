import { describe, expect, it } from 'vitest'
import type { MergeRequestSummary } from '../ports/code-review.ts'
import { filterMergeRequests, hasPending, visibleRange } from './list.ts'

const mr = (number: number, extra: Partial<MergeRequestSummary> = {}): MergeRequestSummary => ({
  id: `g/p!${number}`,
  number,
  title: `Feature ${number}`,
  url: `https://gl.test/${number}`,
  project: 'acme/backend',
  author: 'ana',
  sourceBranch: `feat/x-${number}`,
  targetBranch: 'main',
  draft: false,
  updatedAt: '2026-11-11T10:00:00Z',
  hasConflicts: false,
  openDiscussions: false,
  pipeline: 'success',
  ...extra,
})

describe('hasPending', () => {
  it.each([
    ['a failed pipeline', { pipeline: 'failed' as const }],
    ['a conflict', { hasConflicts: true }],
    ['an open discussion', { openDiscussions: true }],
  ])('should be pending when the merge request has %s', (_label, extra) => {
    expect(hasPending(mr(1, extra))).toBe(true)
  })

  it('should not be pending when a running pipeline is the only thing', () => {
    expect(hasPending(mr(1, { pipeline: 'running' }))).toBe(false)
  })
})

describe('filterMergeRequests', () => {
  const items = [
    mr(1),
    mr(2, { hasConflicts: true }),
    mr(3, { author: 'bruno', title: 'Fix login' }),
  ]

  it('should keep the given order when there is no query', () => {
    expect(filterMergeRequests(items, '', false).map((item) => item.number)).toEqual([1, 2, 3])
  })

  it('should keep only the pending ones when asked to', () => {
    expect(filterMergeRequests(items, '', true).map((item) => item.number)).toEqual([2])
  })

  it('should match the author, the title or the number when typing', () => {
    expect(filterMergeRequests(items, 'bruno', false).map((item) => item.number)).toEqual([3])
    expect(filterMergeRequests(items, 'login', false).map((item) => item.number)).toEqual([3])
    expect(filterMergeRequests(items, '!2', false).map((item) => item.number)).toEqual([2])
  })

  it('should return nothing when no merge request matches', () => {
    expect(filterMergeRequests(items, 'zzzz', false)).toEqual([])
  })
})

describe('visibleRange', () => {
  const base = { viewportHeight: 400, rowHeight: 40, count: 1000, overscan: 3 }

  it('should start at the top with the overscan below when not scrolled', () => {
    expect(visibleRange({ ...base, scrollTop: 0 })).toEqual({ start: 0, end: 13 })
  })

  it('should add the overscan on both sides when scrolled to the middle', () => {
    expect(visibleRange({ ...base, scrollTop: 4000 })).toEqual({ start: 97, end: 113 })
  })

  it('should not go past the last row when scrolled to the end', () => {
    expect(visibleRange({ ...base, scrollTop: 40000 }).end).toBe(1000)
  })

  it('should draw nothing when there are no rows', () => {
    expect(visibleRange({ ...base, count: 0, scrollTop: 0 })).toEqual({ start: 0, end: 0 })
  })
})
