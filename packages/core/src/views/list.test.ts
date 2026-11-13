import { describe, expect, it } from 'vitest'
import type { ViewItem } from '../ports/views.ts'
import {
  filterViewItems,
  groupByProgress,
  hasPending,
  projectCounts,
  visibleRange,
} from './list.ts'

type MergeRequestItem = Extract<ViewItem, { kind: 'mergeRequest' }>
type IssueItem = Extract<ViewItem, { kind: 'issue' }>

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

const issue = (key: string, extra: Partial<IssueItem> = {}): IssueItem => ({
  kind: 'issue',
  id: key,
  key,
  summary: `Task ${key}`,
  url: `https://acme.example.com/browse/${key}`,
  project: key.split('-')[0] ?? '',
  type: 'Story',
  status: 'To Do',
  statusCategory: 'todo',
  updatedAt: '2026-11-11T10:00:00Z',
  ...extra,
})

const ids = (items: readonly ViewItem[]) => items.map((item) => item.id)
const none = { query: '', onlyPending: false }

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
    expect(ids(filterViewItems(items, none))).toEqual(['g/p!1', 'g/p!2', 'g/p!3'])
  })

  it('should keep only the pending ones when asked to', () => {
    expect(ids(filterViewItems(items, { ...none, onlyPending: true }))).toEqual(['g/p!2'])
  })

  it('should match the author, the title or the number when typing', () => {
    expect(ids(filterViewItems(items, { ...none, query: 'bruno' }))).toEqual(['g/p!3'])
    expect(ids(filterViewItems(items, { ...none, query: 'login' }))).toEqual(['g/p!3'])
    expect(ids(filterViewItems(items, { ...none, query: '!2' }))).toEqual(['g/p!2'])
  })

  it('should return nothing when no merge request matches', () => {
    expect(filterViewItems(items, { ...none, query: 'zzzz' })).toEqual([])
  })

  it('should match an issue by key, summary, type or status and never count it as pending', () => {
    const task = issue('ACME-12', { summary: 'Export the report', status: 'In Review' })

    expect(filterViewItems([task], { ...none, query: 'acme-12' })).toEqual([task])
    expect(filterViewItems([task], { ...none, query: 'review' })).toEqual([task])
    expect(filterViewItems([task], { ...none, onlyPending: true })).toEqual([])
  })

  it('should keep only the tasks of the project when one is chosen, together with the query', () => {
    const tasks = [
      issue('NTF-1', { summary: 'Send the digest' }),
      issue('BID-2', { summary: 'Send the bid' }),
      issue('NTF-3', { summary: 'Retry the webhook' }),
    ]

    const chosen = filterViewItems(tasks, { ...none, project: 'NTF' })
    const combined = filterViewItems(tasks, { ...none, project: 'NTF', query: 'send' })

    expect(ids(chosen)).toEqual(['NTF-1', 'NTF-3'])
    expect(ids(combined)).toEqual(['NTF-1'])
  })
})

describe('projectCounts', () => {
  it('should count the tasks of each project, most frequent first and then by key', () => {
    const tasks = [issue('PLTB-1'), issue('NTF-1'), issue('BID-1'), issue('NTF-2'), issue('BID-2')]

    expect(projectCounts([...tasks, mr(1)])).toEqual([
      { project: 'BID', count: 2 },
      { project: 'NTF', count: 2 },
      { project: 'PLTB', count: 1 },
    ])
  })
})

describe('groupByProgress', () => {
  it('should put the tasks in progress before the ones to do, each keeping the list order', () => {
    const tasks = [
      issue('NTF-5'),
      issue('NTF-4', { statusCategory: 'progress' }),
      issue('NTF-3'),
      issue('NTF-2', { statusCategory: 'progress' }),
    ]

    const sections = groupByProgress(tasks)

    expect(sections.map((section) => [section.category, ids(section.items)])).toEqual([
      ['progress', ['NTF-4', 'NTF-2']],
      ['todo', ['NTF-5', 'NTF-3']],
    ])
  })

  it('should leave a section out when none of its tasks is in the list', () => {
    expect(groupByProgress([issue('NTF-1')]).map((section) => section.category)).toEqual(['todo'])
    expect(groupByProgress([])).toEqual([])
  })
})

describe('visibleRange', () => {
  const evenly = (count: number, height: number) =>
    Array.from({ length: count }, (_, index) => index * height)
  const base = { tops: evenly(1000, 40), viewportHeight: 400, overscan: 3 }

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
    expect(visibleRange({ ...base, tops: [], scrollTop: 0 })).toEqual({ start: 0, end: 0 })
  })

  it('should count a short header among taller rows when the heights differ', () => {
    // A 30 px header, three 46 px rows, another header, then rows again
    const tops = [0, 30, 76, 122, 168, 198, 244, 290]

    expect(visibleRange({ tops, scrollTop: 100, viewportHeight: 100, overscan: 0 })).toEqual({
      start: 2,
      end: 6,
    })
  })
})
