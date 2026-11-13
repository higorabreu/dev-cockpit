import type { MergeRequestSummary } from '../ports/code-review.ts'
import type { ViewItem } from '../ports/views.ts'
import { searchItems } from '../search/fuzzy.ts'

// Pending is what the author needs to resolve: failed pipeline, conflict or open discussion
export const hasPending = (item: MergeRequestSummary): boolean =>
  item.pipeline === 'failed' || item.hasConflicts || item.openDiscussions

const searchText = (item: ViewItem) =>
  item.kind === 'mergeRequest'
    ? `${item.title} ${item.project} !${item.number} ${item.author} ${item.sourceBranch}`
    : `${item.key} ${item.summary} ${item.type} ${item.status}`

// Only a merge request can be pending; with `onlyPending` an issue never matches
export function filterViewItems(
  items: readonly ViewItem[],
  query: string,
  onlyPending: boolean,
): readonly ViewItem[] {
  const base = onlyPending
    ? items.filter((item) => item.kind === 'mergeRequest' && hasPending(item))
    : items
  return searchItems(base, query, searchText)
}

export interface RangeInput {
  readonly scrollTop: number
  readonly viewportHeight: number
  readonly rowHeight: number
  readonly count: number
  // Extra rows outside the window, so fast scrolling does not show blanks
  readonly overscan: number
}

// Range of rows to draw [start, end); with 1000 items only a few dozen exist in the DOM
export function visibleRange(input: RangeInput): { start: number; end: number } {
  const { scrollTop, viewportHeight, rowHeight, count, overscan } = input
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const last = Math.ceil((Math.max(0, scrollTop) + viewportHeight) / rowHeight)
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + overscan) }
}
