import { z } from 'zod'
import type { MergeRequestSummary } from '../ports/code-review.ts'
import type { ViewItem } from '../ports/views.ts'

// The version of each listed item the user last saw: item id -> its `updatedAt`
export type SeenMarks = Readonly<Record<string, string>>
// The marks of every view, as the window stores them: view id -> its marks
export const seenViewsSchema = z.record(z.string(), z.record(z.string(), z.string()))

// GitLab and GitHub write the same instant in different ISO forms, so the times are compared, not the texts
function newer(updatedAt: string, seenAt: string): boolean {
  const updated = Date.parse(updatedAt)
  const seen = Date.parse(seenAt)
  return Number.isNaN(updated) || Number.isNaN(seen) ? updatedAt !== seenAt : updated > seen
}

// One of the user's own merge requests needs them while its CI fails, or when it has an open discussion
// and changed since they last saw it listed
export function needsAttention(item: MergeRequestSummary, seenAt: string | undefined): boolean {
  if (item.pipeline === 'failed') return true
  return item.openDiscussions && (seenAt === undefined || newer(item.updatedAt, seenAt))
}

export function attentionCount(items: readonly ViewItem[], seen: SeenMarks): number {
  return items.filter((item) => item.kind === 'mergeRequest' && needsAttention(item, seen[item.id]))
    .length
}

// Seeing a list marks each item at the version shown; what is no longer listed has nothing to keep
export function markSeen(items: readonly ViewItem[]): SeenMarks {
  return Object.fromEntries(items.map((item) => [item.id, item.updatedAt]))
}

export function keepListed(seen: SeenMarks, items: readonly ViewItem[]): SeenMarks {
  const listed = new Set(items.map((item) => item.id))
  return Object.fromEntries(Object.entries(seen).filter(([id]) => listed.has(id)))
}
