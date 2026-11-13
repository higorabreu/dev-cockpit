import { errorBody, fail, type IssueSummary, type IssueTrackerSource, ok } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { taskViews } from './jira-views.ts'

const task: IssueSummary = {
  id: '10001',
  key: 'ACME-1',
  summary: 'Add rate limiting',
  url: 'https://acme.atlassian.net/browse/ACME-1',
  project: 'ACME',
  type: 'Story',
  status: 'In Progress',
  statusCategory: 'progress',
  updatedAt: '2026-11-10T10:00:00.000Z',
}

const source = (result: Awaited<ReturnType<IssueTrackerSource['assignedIssues']>>) => ({
  currentUser: async () => ok({ id: 'a', name: 'Ana' }),
  assignedIssues: async () => result,
})

describe('taskViews', () => {
  it('should list the assigned issues as issue items when the view is tasks', async () => {
    const result = await taskViews(source(ok([task]))).items('tasks')

    expect(result).toEqual({ ok: true, value: [{ kind: 'issue', ...task }] })
  })

  it('should pass the failure on when Jira refuses', async () => {
    const result = await taskViews(source(fail(errorBody('DCK-JRA-001', 'HTTP 401')))).items(
      'tasks',
    )

    expect(!result.ok && result.error.data?.code).toBe('DCK-JRA-001')
  })

  it('should refuse a view that is not tasks', async () => {
    const result = await taskViews(source(ok([task]))).items('review')

    expect(!result.ok && result.error.data?.code).toBe('DCK-IPC-003')
  })
})
