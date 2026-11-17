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
import { ciState, createGitHubClient, gitHubApiRoot } from './github-client.ts'
import { createRateGate } from './rate-gate.ts'

type Reply = HttpResponse | 'network'

// Answers by path, since the lookups of several pull requests run in parallel
function fakeHttp(routes: Record<string, Reply | Reply[]>) {
  const requests: HttpRequest[] = []
  const http: HttpClient = {
    async get(request) {
      requests.push(request)
      const path = new URL(request.url).pathname
      const route = routes[path]
      const reply = Array.isArray(route) ? route.shift() : route
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
): HttpResponse => ({ status, headers, body: JSON.stringify(value) })

const codeOf = (result: Result<unknown, { data?: { code?: string } }>) =>
  result.ok ? undefined : result.error.data?.code

const API = 'https://api.github.com'
const user = { id: 7, login: 'ana', name: 'Ana Souza' }
const searchItem = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/acme/backend/pull/${number}`,
  user: { login: 'bruno' },
  draft: false,
  updated_at: '2026-11-11T10:00:00Z',
  repository_url: `${API}/repos/acme/backend`,
  pull_request: { url: `${API}/repos/acme/backend/pulls/${number}` },
  ...extra,
})
const pull = (extra: Record<string, unknown> = {}) => ({
  draft: false,
  mergeable: true,
  head: { ref: 'feat/login', sha: 'abc123' },
  base: { ref: 'main' },
  ...extra,
})
const runs = (...states: [string, string | null][]) => ({
  total_count: states.length,
  check_runs: states.map(([status, conclusion]) => ({ status, conclusion })),
})
const noStatuses = { state: 'pending', total_count: 0 }

const routesFor = (items: unknown[], extra: Record<string, Reply | Reply[]> = {}) => ({
  '/user': json(user),
  '/search/issues': json({ total_count: items.length, items }),
  ...extra,
})

const client = (routes: Record<string, Reply | Reply[]>, baseUrl = 'https://github.com') => {
  const fake = fakeHttp(routes)
  return {
    ...fake,
    source: createGitHubClient({ http: fake.http, baseUrl, token: 'ghp_x' }),
  }
}

describe('gitHubApiRoot', () => {
  it.each([
    ['https://github.com', 'https://api.github.com'],
    ['https://github.example.com', 'https://github.example.com/api/v3'],
    ['https://github.example.com/api/v3/', 'https://github.example.com/api/v3'],
    ['http://127.0.0.1:8099', 'http://127.0.0.1:8099/api/v3'],
  ])('should give the API root when the address is %s', (input, expected) => {
    expect(gitHubApiRoot(input)).toBe(expected)
  })
})

describe('currentUser', () => {
  it('should return the user and send the token as a bearer header when the token is valid', async () => {
    const { source, requests } = client({ '/user': json(user) })

    const result = await source.currentUser()

    expect(result).toEqual({ ok: true, value: { id: '7', username: 'ana', name: 'Ana Souza' } })
    expect(requests[0]?.url).toBe('https://api.github.com/user?')
    expect(requests[0]?.headers).toMatchObject({
      authorization: 'Bearer ghp_x',
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    })
  })

  it('should call the Enterprise API under /api/v3 when the address is not github.com', async () => {
    const { source, requests } = client(
      { '/api/v3/user': json(user) },
      'https://github.example.com',
    )

    await source.currentUser()

    expect(requests[0]?.url).toBe('https://github.example.com/api/v3/user?')
  })

  it('should use the login as the name when the account has none', async () => {
    const { source } = client({ '/user': json({ ...user, name: null }) })

    const result = await source.currentUser()

    expect(result.ok && result.value.name).toBe('ana')
  })

  it.each([
    [401, 'DCK-GHB-001'],
    [403, 'DCK-GHB-002'],
    [404, 'DCK-GHB-003'],
    [429, 'DCK-GHB-004'],
    [502, 'DCK-GHB-005'],
  ])('should fail with the matching code when the status is %i', async (status, code) => {
    const { source } = client({ '/user': json({ message: 'Bad credentials' }, {}, status) })

    expect(codeOf(await source.currentUser())).toBe(code)
  })

  it('should fail with the rate limit code when a 403 has no requests left', async () => {
    const { source } = client({
      '/user': json({ message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' }, 403),
    })

    expect(codeOf(await source.currentUser())).toBe('DCK-GHB-004')
  })

  it('should fail with the unexpected response code when the body does not match', async () => {
    const { source } = client({ '/user': json({ id: 'x' }) })

    expect(codeOf(await source.currentUser())).toBe('DCK-GHB-006')
  })

  it('should fail with the unexpected response code when the body is not JSON', async () => {
    const { source } = client({ '/user': { status: 200, headers: {}, body: '<html>' } })

    expect(codeOf(await source.currentUser())).toBe('DCK-GHB-006')
  })

  it('should fail with the no response code when the network is down', async () => {
    const { source } = client({ '/user': 'network' })

    expect(codeOf(await source.currentUser())).toBe('DCK-NET-001')
  })
})

describe('mergeRequests', () => {
  it('should search the open pull requests requesting the login as reviewer when the view is review', async () => {
    const { source, requests } = client(routesFor([]))

    await source.mergeRequests('review')

    const search = new URL(requests[1]?.url ?? '')
    expect(search.pathname).toBe('/search/issues')
    expect(search.searchParams.get('q')).toBe('is:pr is:open archived:false review-requested:ana')
    expect(search.searchParams.get('sort')).toBe('updated')
    expect(search.searchParams.get('order')).toBe('desc')
    expect(search.searchParams.get('per_page')).toBe('100')
  })

  it('should search by author when the view is mine', async () => {
    const { source, requests } = client(routesFor([]))

    await source.mergeRequests('mine')

    const search = new URL(requests[1]?.url ?? '')
    expect(search.searchParams.get('q')).toBe('is:pr is:open archived:false author:ana')
  })

  it('should map the fields, the branches, the conflict and the checks when listing', async () => {
    const { source } = client(
      routesFor([searchItem(12, { draft: true })], {
        '/repos/acme/backend/pulls/12': json(pull({ draft: true, mergeable: false })),
        '/repos/acme/backend/commits/abc123/check-runs': json(
          runs(['completed', 'success'], ['completed', 'failure']),
        ),
        '/repos/acme/backend/commits/abc123/status': json(noStatuses),
      }),
    )

    const result = await source.mergeRequests('review')

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: 'acme/backend#12',
          number: 12,
          title: 'PR 12',
          url: 'https://github.com/acme/backend/pull/12',
          project: 'acme/backend',
          author: 'bruno',
          sourceBranch: 'feat/login',
          targetBranch: 'main',
          draft: true,
          updatedAt: '2026-11-11T10:00:00Z',
          hasConflicts: true,
          openDiscussions: false,
          pipeline: 'failed',
          referenceMark: '#',
        },
      ],
    })
  })

  it('should report no CI when the commit has no check runs and no statuses', async () => {
    const { source } = client(
      routesFor([searchItem(1)], {
        '/repos/acme/backend/pulls/1': json(pull()),
        '/repos/acme/backend/commits/abc123/check-runs': json(runs()),
        '/repos/acme/backend/commits/abc123/status': json(noStatuses),
      }),
    )

    const result = await source.mergeRequests('mine')

    expect(result.ok && result.value[0]?.pipeline).toBe('none')
  })

  it('should read the commit statuses of older CI services when there are no check runs', async () => {
    const { source } = client(
      routesFor([searchItem(1)], {
        '/repos/acme/backend/pulls/1': json(pull()),
        '/repos/acme/backend/commits/abc123/check-runs': json(runs()),
        '/repos/acme/backend/commits/abc123/status': json({ state: 'pending', total_count: 2 }),
      }),
    )

    const result = await source.mergeRequests('mine')

    expect(result.ok && result.value[0]?.pipeline).toBe('pending')
  })

  it('should keep the list and leave the row without branch or CI when its lookup fails', async () => {
    const { source } = client(
      routesFor([searchItem(1), searchItem(2)], {
        '/repos/acme/backend/pulls/1': 'network',
        '/repos/acme/backend/pulls/2': json(pull()),
        '/repos/acme/backend/commits/abc123/check-runs': json(runs(['in_progress', null])),
        '/repos/acme/backend/commits/abc123/status': json({}, {}, 403),
      }),
    )

    const result = await source.mergeRequests('mine')

    expect(result.ok && result.value.map((item) => [item.sourceBranch, item.pipeline])).toEqual([
      ['', 'unknown'],
      ['feat/login', 'running'],
    ])
  })

  it('should leave out an issue when the search returns one', async () => {
    const { source } = client(
      routesFor([searchItem(1, { pull_request: undefined })], {
        '/repos/acme/backend/pulls/1': json(pull()),
      }),
    )

    const result = await source.mergeRequests('mine')

    expect(result).toEqual({ ok: true, value: [] })
  })

  it('should follow the next link until it ends when paginating', async () => {
    const next = { link: `<${API}/search/issues?page=2>; rel="next", <${API}/x>; rel="last"` }
    const { source, requests } = client({
      '/user': json(user),
      '/search/issues': [json({ items: [searchItem(1)] }, next), json({ items: [searchItem(2)] })],
      '/repos/acme/backend/pulls/1': 'network',
      '/repos/acme/backend/pulls/2': 'network',
    })

    const result = await source.mergeRequests('mine')

    expect(result.ok && result.value.map((item) => item.number)).toEqual([1, 2])
    const pages = requests
      .filter((request) => request.url.includes('/search/issues'))
      .map((request) => new URL(request.url).searchParams.get('page'))
    expect(pages).toEqual(['1', '2'])
  })

  it('should stop after five pages when every page says there is another', async () => {
    const next = { link: `<${API}/search/issues?page=9>; rel="next"` }
    const { source, requests } = client({
      '/user': json(user),
      '/search/issues': Array.from({ length: 8 }, () => json({ items: [] }, next)),
    })

    await source.mergeRequests('mine')

    expect(requests.filter((request) => request.url.includes('/search/issues'))).toHaveLength(5)
  })

  it('should stop and fail when a later page is rate limited', async () => {
    const next = { link: `<${API}/search/issues?page=2>; rel="next"` }
    const { source } = client({
      '/user': json(user),
      '/search/issues': [json({ items: [] }, next), json({}, { 'retry-after': '60' }, 403)],
    })

    expect(codeOf(await source.mergeRequests('mine'))).toBe('DCK-GHB-004')
  })

  it('should fail without listing when the user lookup fails', async () => {
    const { source, requests } = client({ '/user': json({}, {}, 401) })

    expect(codeOf(await source.mergeRequests('review'))).toBe('DCK-GHB-001')
    expect(requests).toHaveLength(1)
  })
})

describe('rate limits', () => {
  it('should not call the search again before its reset when a refresh was limited', async () => {
    const now = 1_800_000_000_000
    const gate = createRateGate({ now: () => now })
    const fake = fakeHttp({
      '/user': [json(user), json(user)],
      '/search/issues': json({}, { 'x-ratelimit-remaining': '0', 'retry-after': '60' }, 403),
    })
    const source = () =>
      createGitHubClient({ http: fake.http, baseUrl: 'https://github.com', token: 'ghp_x', gate })
    await source().mergeRequests('review')

    const second = await source().mergeRequests('review')

    expect(codeOf(second)).toBe('DCK-GHB-004')
    expect(fake.requests.filter((request) => request.url.includes('/search/'))).toHaveLength(1)
  })

  it('should skip the row lookups when few core requests are left', async () => {
    const { source, requests } = client({
      '/user': json(user, { 'x-ratelimit-remaining': '50' }),
      '/search/issues': json({ items: [searchItem(1)] }),
    })

    const result = await source.mergeRequests('mine')

    expect(result.ok && result.value[0]?.pipeline).toBe('unknown')
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/user',
      '/search/issues',
    ])
  })
})

describe('ciState', () => {
  it.each([
    [['success', 'failed', 'running'], 'failed'],
    [['success', 'pending', 'running'], 'running'],
    [['success', 'canceled'], 'canceled'],
    [['success', 'success'], 'success'],
    [[], 'none'],
  ] as const)('should give the strongest state when the checks are %j', (states, expected) => {
    expect(ciState(states)).toBe(expected)
  })
})
