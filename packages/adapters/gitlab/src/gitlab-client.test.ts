import {
  errorBody,
  fail,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
  ok,
  type Result,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createGitLabClient } from './gitlab-client.ts'

type Reply = HttpResponse | 'network'

function fakeHttp(replies: Reply[]) {
  const requests: HttpRequest[] = []
  const http: HttpClient = {
    async get(request) {
      requests.push(request)
      const reply = replies.shift()
      if (!reply || reply === 'network') return fail(errorBody('DCK-NET-001'))
      return ok(reply)
    },
  }
  return { http, requests }
}

const json = (
  value: unknown,
  headers: Record<string, string> = {},
  status = 200,
): HttpResponse => ({
  status,
  headers,
  body: JSON.stringify(value),
})

const codeOf = (result: Result<unknown, { data?: { code?: string } }>) =>
  result.ok ? undefined : result.error.data?.code

const user = { id: 7, username: 'higor', name: 'Higor' }
const mr = (iid: number, extra: Record<string, unknown> = {}) => ({
  iid,
  project_id: 11,
  title: `MR ${iid}`,
  web_url: `https://gl.test/grupo/app/-/merge_requests/${iid}`,
  references: { full: `grupo/app!${iid}` },
  author: { username: 'ana' },
  source_branch: 'feat/x',
  target_branch: 'main',
  draft: false,
  updated_at: '2026-11-11T10:00:00Z',
  has_conflicts: false,
  blocking_discussions_resolved: true,
  ...extra,
})

const client = (replies: Reply[]) => {
  const fake = fakeHttp(replies)
  return {
    ...fake,
    source: createGitLabClient({ http: fake.http, baseUrl: 'https://gl.test/', token: 'glpat-x' }),
  }
}

describe('currentUser', () => {
  it('should return the user and send the token in the header when the token is valid', async () => {
    const { source, requests } = client([json(user)])

    const result = await source.currentUser()

    expect(result).toEqual({ ok: true, value: { id: '7', username: 'higor', name: 'Higor' } })
    expect(requests[0]?.url).toBe('https://gl.test/api/v4/user?')
    expect(requests[0]?.headers?.['private-token']).toBe('glpat-x')
  })

  it.each([
    [401, 'DCK-GLB-001'],
    [403, 'DCK-GLB-002'],
    [404, 'DCK-GLB-003'],
    [429, 'DCK-GLB-004'],
    [502, 'DCK-GLB-005'],
  ])('should fail with the matching code when the status is %i', async (status, code) => {
    const { source } = client([json({}, {}, status)])

    expect(codeOf(await source.currentUser())).toBe(code)
  })

  it('should fail with the unexpected response code when the body does not match', async () => {
    const { source } = client([json({ id: 'x' })])

    expect(codeOf(await source.currentUser())).toBe('DCK-GLB-006')
  })

  it('should fail with the no response code when the network is down', async () => {
    const { source } = client(['network'])

    expect(codeOf(await source.currentUser())).toBe('DCK-NET-001')
  })
})

describe('mergeRequests', () => {
  it('should filter by reviewer when the view is review', async () => {
    const { source, requests } = client([json(user), json([mr(1)])])

    await source.mergeRequests('review')

    expect(requests[1]?.url).toContain('reviewer_id=7')
    expect(requests[1]?.url).toContain('state=opened')
  })

  it('should filter by author when the view is mine', async () => {
    const { source, requests } = client([json(user), json([mr(1)])])

    await source.mergeRequests('mine')

    expect(requests[1]?.url).toContain('author_id=7')
  })

  it('should map the fields and the flags when listing', async () => {
    const { source } = client([
      json(user),
      json([
        mr(5, {
          draft: true,
          has_conflicts: true,
          blocking_discussions_resolved: false,
        }),
      ]),
      json({ head_pipeline: { status: 'failed' } }),
    ])

    const result = await source.mergeRequests('mine')

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: 'grupo/app!5',
          number: 5,
          title: 'MR 5',
          url: 'https://gl.test/grupo/app/-/merge_requests/5',
          project: 'grupo/app',
          author: 'ana',
          sourceBranch: 'feat/x',
          targetBranch: 'main',
          draft: true,
          updatedAt: '2026-11-11T10:00:00Z',
          hasConflicts: true,
          openDiscussions: true,
          pipeline: 'failed',
        },
      ],
    })
  })

  it('should report no pipeline when the merge request has none', async () => {
    const { source } = client([json(user), json([mr(1)]), json({ head_pipeline: null })])

    const result = await source.mergeRequests('mine')

    expect(result.ok && result.value[0]?.pipeline).toBe('none')
  })

  it('should follow the next page header until it ends when paginating', async () => {
    const { source, requests } = client([
      json(user),
      json([mr(1)], { 'x-next-page': '2' }),
      json([mr(2)], { 'x-next-page': '' }),
      json({ head_pipeline: { status: 'success' } }),
      json({ head_pipeline: { status: 'running' } }),
    ])

    const result = await source.mergeRequests('mine')

    expect(result.ok && result.value.map((item) => item.number)).toEqual([1, 2])
    expect(requests[2]?.url).toContain('page=2')
  })

  it('should read the pipeline of each merge request from its own endpoint when listing', async () => {
    const { source, requests } = client([
      json(user),
      json([mr(1)]),
      json({ head_pipeline: { status: 'success' } }),
    ])

    const result = await source.mergeRequests('mine')

    expect(requests[2]?.url).toBe('https://gl.test/api/v4/projects/11/merge_requests/1?')
    expect(result.ok && result.value[0]?.pipeline).toBe('success')
  })

  it('should keep the list and mark the pipeline unknown when one lookup fails', async () => {
    const { source } = client([
      json(user),
      json([mr(1), mr(2)]),
      'network',
      json({ head_pipeline: { status: 'failed' } }),
    ])

    const result = await source.mergeRequests('mine')

    expect(result.ok && result.value.map((item) => item.pipeline)).toEqual(['unknown', 'failed'])
  })

  it('should stop and fail when a later page is rate limited', async () => {
    const { source } = client([
      json(user),
      json([mr(1)], { 'x-next-page': '2' }),
      json({}, {}, 429),
    ])

    expect(codeOf(await source.mergeRequests('mine'))).toBe('DCK-GLB-004')
  })

  it('should fail without listing when the user lookup fails', async () => {
    const { source, requests } = client([json({}, {}, 401)])

    expect(codeOf(await source.mergeRequests('review'))).toBe('DCK-GLB-001')
    expect(requests).toHaveLength(1)
  })
})
