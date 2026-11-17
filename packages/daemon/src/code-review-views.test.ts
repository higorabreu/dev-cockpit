import {
  type CodeReviewSource,
  errorBody,
  fail,
  type MergeRequestSummary,
  type MergeRequestView,
  ok,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { mergeRequestViews } from './code-review-views.ts'

const pullRequest: MergeRequestSummary = {
  id: 'acme/backend#12',
  number: 12,
  title: 'Add rate limiting',
  url: 'https://github.example.com/acme/backend/pull/12',
  project: 'acme/backend',
  author: 'bruno',
  sourceBranch: 'feat/limits',
  targetBranch: 'main',
  draft: false,
  updatedAt: '2026-11-10T10:00:00Z',
  hasConflicts: false,
  openDiscussions: false,
  pipeline: 'success',
  referenceMark: '#',
}

const source = (asked: MergeRequestView[], failing = false): CodeReviewSource => ({
  currentUser: async () => ok({ id: '7', username: 'ana', name: 'Ana' }),
  mergeRequests: async (view) => {
    asked.push(view)
    return failing ? fail(errorBody('DCK-GHB-004', 'HTTP 429')) : ok([pullRequest])
  },
})

const lists = { 'github-review': 'review', 'github-mine': 'mine' } as const

describe('mergeRequestViews', () => {
  it('should ask for the list the view stands for and give merge request items', async () => {
    const asked: MergeRequestView[] = []

    const result = await mergeRequestViews(source(asked), lists).items('github-mine')

    expect(asked).toEqual(['mine'])
    expect(result).toEqual({ ok: true, value: [{ kind: 'mergeRequest', ...pullRequest }] })
  })

  it('should pass the failure on when the service refuses', async () => {
    const result = await mergeRequestViews(source([], true), lists).items('github-review')

    expect(!result.ok && result.error.data?.code).toBe('DCK-GHB-004')
  })

  it.each(['review', 'toString'])(
    'should refuse %s when it is not one of the views',
    async (view) => {
      const asked: MergeRequestView[] = []

      const result = await mergeRequestViews(source(asked), lists).items(view)

      expect(!result.ok && result.error.data?.code).toBe('DCK-IPC-003')
      expect(asked).toEqual([])
    },
  )
})
