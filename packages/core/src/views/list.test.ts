import { describe, expect, it } from 'vitest'
import type { ViewItem } from '../ports/views.ts'
import { filterViewItems, hasPending, visibleRange } from './list.ts'

type MergeRequestItem = Extract<ViewItem, { kind: 'mergeRequest' }>

const mr = (number: number, extra: Partial<MergeRequestItem> = {}): MergeRequestItem => ({
  kind: 'mergeRequest',
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

describe('filterViewItems', () => {
  const items = [
    mr(1),
    mr(2, { hasConflicts: true }),
    mr(3, { author: 'bruno', title: 'Fix login' }),
  ]

  it('should keep the given order when there is no query', () => {
    expect(filterViewItems(items, '', false).map((item) => item.id)).toEqual([
      'g/p!1',
      'g/p!2',
      'g/p!3',
    ])
  })

  it('should keep only the pending ones when asked to', () => {
    expect(filterViewItems(items, '', true).map((item) => item.id)).toEqual(['g/p!2'])
  })

  it('should match the author, the title or the number when typing', () => {
    expect(filterViewItems(items, 'bruno', false).map((item) => item.id)).toEqual(['g/p!3'])
    expect(filterViewItems(items, 'login', false).map((item) => item.id)).toEqual(['g/p!3'])
    expect(filterViewItems(items, '!2', false).map((item) => item.id)).toEqual(['g/p!2'])
  })

  it('should return nothing when no merge request matches', () => {
    expect(filterViewItems(items, 'zzzz', false)).toEqual([])
  })

  it('should match an issue by key, summary, type or status and never count it as pending', () => {
    const issue: ViewItem = {
      kind: 'issue',
      id: '10001',
      key: 'ACME-12',
      summary: 'Export the report',
      url: 'https://acme.example.com/browse/ACME-12',
      project: 'ACME',
      type: 'Bug',
      status: 'In Review',
      statusCategory: 'progress',
      updatedAt: '2026-11-11T10:00:00Z',
    }

    expect(filterViewItems([issue], 'acme-12', false)).toEqual([issue])
    expect(filterViewItems([issue], 'review', false)).toEqual([issue])
    expect(filterViewItems([issue], '', true)).toEqual([])
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
