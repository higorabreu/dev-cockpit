import type { MergeRequestSummary } from '../ports/code-review.ts'
import type { IssueStatusCategory, ViewItem } from '../ports/views.ts'
import { searchViewItems } from './search.ts'

// Pending is what the author needs to resolve: failed pipeline, conflict or open discussion
export const hasPending = (item: MergeRequestSummary): boolean =>
  item.pipeline === 'failed' || item.hasConflicts || item.openDiscussions

export interface ViewFilter {
  readonly query: string
  // Only a merge request can be pending; with it an issue never matches
  readonly onlyPending: boolean
  // Only the tasks of this project key, when set
  readonly project?: string | undefined
}

export function filterViewItems(
  items: readonly ViewItem[],
  filter: ViewFilter,
): readonly ViewItem[] {
  const { onlyPending, project } = filter
  const base = items.filter(
    (item) =>
      (!onlyPending || (item.kind === 'mergeRequest' && hasPending(item))) &&
      (project === undefined || (item.kind === 'issue' && item.project === project)),
  )
  return searchViewItems(base, filter.query)
}

export interface ProjectCount {
  readonly project: string
  readonly count: number
}

// The projects of the tasks, most frequent first and then by key
export function projectCounts(items: readonly ViewItem[]): readonly ProjectCount[] {
  const counts = new Map<string, number>()
  for (const item of items)
    if (item.kind === 'issue') counts.set(item.project, (counts.get(item.project) ?? 0) + 1)
  return [...counts]
    .map(([project, count]) => ({ project, count }))
    .sort((a, b) => b.count - a.count || a.project.localeCompare(b.project))
}

export interface ProgressSection {
  readonly category: IssueStatusCategory
  readonly items: readonly ViewItem[]
}

const SECTION_ORDER: readonly IssueStatusCategory[] = ['progress', 'todo']

// Tasks under way come before the ones still to do; each section keeps the order the list had (most
// recently updated first, or the search ranking) and an empty one is left out
export function groupByProgress(items: readonly ViewItem[]): readonly ProgressSection[] {
  return SECTION_ORDER.map((category) => ({
    category,
    items: items.filter((item) => item.kind === 'issue' && item.statusCategory === category),
  })).filter((section) => section.items.length > 0)
}

export interface RangeInput {
  // Where each entry starts, in ascending order; an entry ends where the next one starts
  readonly tops: readonly number[]
  readonly scrollTop: number
  readonly viewportHeight: number
  // Extra entries outside the window, so fast scrolling does not show blanks
  readonly overscan: number
}

// How many entries start before `y` (or at it, when `inclusive`)
function countBefore(tops: readonly number[], y: number, inclusive: boolean): number {
  let low = 0
  let high = tops.length
  while (low < high) {
    const middle = (low + high) >> 1
    const top = tops[middle] ?? 0
    if (top < y || (inclusive && top === y)) low = middle + 1
    else high = middle
  }
  return low
}

// Range of entries to draw [start, end), with rows of any height; with 1000 items only a few dozen exist
// in the DOM
export function visibleRange(input: RangeInput): { start: number; end: number } {
  const { tops, viewportHeight, overscan } = input
  const scrollTop = Math.max(0, input.scrollTop)
  const first = Math.max(0, countBefore(tops, scrollTop, true) - 1)
  const end = countBefore(tops, scrollTop + viewportHeight, false)
  return { start: Math.max(0, first - overscan), end: Math.min(tops.length, end + overscan) }
}
