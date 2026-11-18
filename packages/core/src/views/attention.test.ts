import { describe, expect, it } from 'vitest'
import type { MergeRequestSummary } from '../ports/code-review.ts'
import type { ViewItem } from '../ports/views.ts'
import { attentionCount, keepListed, markSeen, needsAttention } from './attention.ts'

const mergeRequest = (
  number: number,
  extra: Partial<MergeRequestSummary> = {},
): Extract<ViewItem, { kind: 'mergeRequest' }> => ({
  kind: 'mergeRequest',
  id: `acme/backend!${number}`,
  number,
  title: `Merge request ${number}`,
  url: `https://gitlab.example.com/acme/backend/-/merge_requests/${number}`,
  project: 'acme/backend',
  author: 'ana',
  sourceBranch: `feat/item-${number}`,
  targetBranch: 'main',
  draft: false,
  updatedAt: '2026-11-11T10:00:00Z',
  hasConflicts: false,
  openDiscussions: false,
  pipeline: 'success',
  ...extra,
})

describe('needsAttention', () => {
  it('should need the user when the CI failed, even if it was seen at this version', () => {
    const item = mergeRequest(1, { pipeline: 'failed' })

    expect(needsAttention(item, item.updatedAt)).toBe(true)
  })

  it('should need the user when a discussion is open and the item was never seen', () => {
    expect(needsAttention(mergeRequest(1, { openDiscussions: true }), undefined)).toBe(true)
  })

  it('should not need the user when the open discussion was seen at this version', () => {
    const item = mergeRequest(1, { openDiscussions: true })

    expect(needsAttention(item, '2026-11-11T10:00:00.000Z')).toBe(false)
  })

  it('should need the user again when the item changed after it was seen', () => {
    const item = mergeRequest(1, { openDiscussions: true, updatedAt: '2026-11-12T08:00:00Z' })

    expect(needsAttention(item, '2026-11-11T10:00:00Z')).toBe(true)
  })

  it('should not need the user when nothing is open and the CI did not fail', () => {
    const item = mergeRequest(1, { pipeline: 'running', hasConflicts: true })

    expect(needsAttention(item, undefined)).toBe(false)
  })

  it('should compare the texts when a date cannot be read', () => {
    const item = mergeRequest(1, { openDiscussions: true, updatedAt: 'later' })

    expect(needsAttention(item, 'later')).toBe(false)
    expect(needsAttention(item, 'earlier')).toBe(true)
  })
})

describe('attentionCount', () => {
  it('should count only the merge requests that need the user when given a seen list', () => {
    const failed = mergeRequest(1, { pipeline: 'failed' })
    const seen = mergeRequest(2, { openDiscussions: true })
    const unseen = mergeRequest(3, { openDiscussions: true })
    const quiet = mergeRequest(4)

    const count = attentionCount([failed, seen, unseen, quiet], { [seen.id]: seen.updatedAt })

    expect(count).toBe(2)
  })
})

describe('seen marks', () => {
  it('should mark every listed item at its version when the list is seen', () => {
    const items = [mergeRequest(1), mergeRequest(2, { updatedAt: '2026-11-12T08:00:00Z' })]

    expect(markSeen(items)).toEqual({
      'acme/backend!1': '2026-11-11T10:00:00Z',
      'acme/backend!2': '2026-11-12T08:00:00Z',
    })
  })

  it('should drop the marks of items no longer listed when keeping the listed ones', () => {
    const seen = { 'acme/backend!1': 'a', 'acme/backend!2': 'b' }

    expect(keepListed(seen, [mergeRequest(2), mergeRequest(3)])).toEqual({ 'acme/backend!2': 'b' })
  })
})
