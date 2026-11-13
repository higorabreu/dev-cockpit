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
import { createJiraClient } from './jira-client.ts'

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

const json = (value: unknown, status = 200): HttpResponse => ({
  status,
  headers: {},
  body: JSON.stringify(value),
})

const failureOf = (result: Result<unknown, { data?: { code?: string; detail?: string } }>) =>
  result.ok ? undefined : result.error.data

const myself = {
  accountId: '5b10a2844c20165700ede21g',
  displayName: 'Ana Souza',
  emailAddress: 'ana@example.com',
}

const issue = (
  key: string,
  extra: { category?: string; status?: string; updated?: string } = {},
) => ({
  id: `1${key.replace(/\D/g, '')}`,
  key,
  self: `https://acme.atlassian.net/rest/api/3/issue/${key}`,
  fields: {
    summary: `Task ${key}`,
    status: {
      name: extra.status ?? 'To Do',
      statusCategory: { id: 2, key: extra.category ?? 'new', name: 'To Do' },
    },
    issuetype: { name: 'Story' },
    project: { key: 'ACME', name: 'Acme' },
    updated: extra.updated ?? '2026-11-10T10:00:00.000+0000',
  },
})

const page = (issues: unknown[], nextPageToken?: string) =>
  json(nextPageToken ? { issues, nextPageToken, isLast: false } : { issues, isLast: true })

const client = (replies: Reply[]) => {
  const fake = fakeHttp(replies)
  return {
    ...fake,
    source: createJiraClient({
      http: fake.http,
      baseUrl: 'https://acme.atlassian.net/',
      email: 'ana@example.com',
      token: 'atlassian-secret-token',
    }),
  }
}

describe('currentUser', () => {
  it('should return the account id and display name when the credentials are valid', async () => {
    const { source, requests } = client([json(myself)])

    const result = await source.currentUser()

    expect(result).toEqual({
      ok: true,
      value: { id: '5b10a2844c20165700ede21g', name: 'Ana Souza' },
    })
    expect(requests[0]?.url).toBe('https://acme.atlassian.net/rest/api/3/myself')
  })

  it('should send Basic authentication built from the e-mail and the token when requesting', async () => {
    const { source, requests } = client([json(myself)])

    await source.currentUser()

    const expected = Buffer.from('ana@example.com:atlassian-secret-token').toString('base64')
    expect(requests[0]?.headers?.authorization).toBe(`Basic ${expected}`)
    expect(requests[0]?.headers?.accept).toBe('application/json')
  })

  it('should accept an account whose e-mail is hidden when reading the user', async () => {
    const { source } = client([json({ accountId: 'abc', displayName: 'Ana' })])

    expect((await source.currentUser()).ok).toBe(true)
  })

  it.each([
    [401, 'DCK-JRA-001'],
    [403, 'DCK-JRA-002'],
    [404, 'DCK-JRA-003'],
    [429, 'DCK-JRA-004'],
    [500, 'DCK-JRA-005'],
    [503, 'DCK-JRA-005'],
  ])('should fail with the matching code when the status is %i', async (status, code) => {
    const { source } = client([json({}, status)])

    expect(failureOf(await source.currentUser())?.code).toBe(code)
  })

  it('should fail with the not Jira code when the body is not JSON', async () => {
    const { source } = client([{ status: 200, headers: {}, body: '<html>Welcome</html>' }])

    expect(failureOf(await source.currentUser())?.code).toBe('DCK-JRA-006')
  })

  it('should fail with the not Jira code when the JSON has another shape', async () => {
    const { source } = client([json({ id: 7, username: 'ana' })])

    expect(failureOf(await source.currentUser())?.code).toBe('DCK-JRA-006')
  })

  it('should fail with the no response code when the network is down', async () => {
    const { source } = client(['network'])

    expect(failureOf(await source.currentUser())?.code).toBe('DCK-NET-001')
  })

  it('should keep the token and the e-mail out of the error detail when Jira refuses', async () => {
    const outcomes = await Promise.all(
      [json({}, 401), json({}, 403), json({}, 500), json({ nope: true })].map((reply) =>
        client([reply]).source.currentUser(),
      ),
    )

    const details = JSON.stringify(outcomes)
    expect(details).toContain('/rest/api/3/myself')
    expect(details).not.toContain('atlassian-secret-token')
    expect(details).not.toContain('ana@example.com')
    expect(details).not.toContain(Buffer.from('ana@example.com:').toString('base64').slice(0, 12))
  })
})

describe('assignedIssues', () => {
  it('should ask for the open issues assigned to the user with only the fields shown', async () => {
    const { source, requests } = client([page([])])

    await source.assignedIssues()

    const url = new URL(requests[0]?.url ?? '')
    expect(url.origin + url.pathname).toBe('https://acme.atlassian.net/rest/api/3/search/jql')
    expect(url.searchParams.get('jql')).toBe(
      'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
    )
    expect(url.searchParams.get('fields')).toBe('summary,status,issuetype,project,updated')
    expect(url.searchParams.get('maxResults')).toBe('100')
    expect(url.searchParams.has('nextPageToken')).toBe(false)
  })

  it('should map an issue to a summary with its browse address when listing', async () => {
    const { source } = client([
      page([issue('ACME-123', { category: 'indeterminate', status: 'In Review' })]),
    ])

    const result = await source.assignedIssues()

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: '1123',
          key: 'ACME-123',
          summary: 'Task ACME-123',
          url: 'https://acme.atlassian.net/browse/ACME-123',
          project: 'ACME',
          type: 'Story',
          status: 'In Review',
          statusCategory: 'progress',
          updatedAt: '2026-11-10T10:00:00.000Z',
        },
      ],
    })
  })

  it('should read the category of the status as to do or in progress when listing', async () => {
    const { source } = client([
      page([
        issue('ACME-1', { category: 'new' }),
        issue('ACME-2', { category: 'indeterminate' }),
        issue('ACME-3', { category: 'undefined' }),
      ]),
    ])

    const result = await source.assignedIssues()

    expect(result.ok && result.value.map((item) => item.statusCategory)).toEqual([
      'todo',
      'progress',
      'todo',
    ])
  })

  it('should leave out an issue that is already done when listing', async () => {
    const { source } = client([page([issue('ACME-1'), issue('ACME-2', { category: 'done' })])])

    const result = await source.assignedIssues()

    expect(result.ok && result.value.map((item) => item.key)).toEqual(['ACME-1'])
  })

  it('should follow the next page token until the last page when paginating', async () => {
    const { source, requests } = client([
      page([issue('ACME-1')], 'token-2'),
      page([issue('ACME-2')], 'token-3'),
      page([issue('ACME-3')]),
    ])

    const result = await source.assignedIssues()

    expect(result.ok && result.value.map((item) => item.key)).toEqual([
      'ACME-1',
      'ACME-2',
      'ACME-3',
    ])
    expect(
      requests.map((request) => new URL(request.url).searchParams.get('nextPageToken')),
    ).toEqual([null, 'token-2', 'token-3'])
  })

  it('should stop after ten pages when the server keeps returning a next page', async () => {
    const replies = Array.from({ length: 12 }, (_, index) =>
      page([issue(`ACME-${index + 1}`)], `token-${index + 2}`),
    )
    const { source, requests } = client(replies)

    const result = await source.assignedIssues()

    expect(requests).toHaveLength(10)
    expect(result.ok && result.value).toHaveLength(10)
  })

  it('should stop when the page says it is the last even with a token', async () => {
    const { source, requests } = client([
      json({ issues: [issue('ACME-1')], nextPageToken: 'stale', isLast: true }),
    ])

    await source.assignedIssues()

    expect(requests).toHaveLength(1)
  })

  it('should fail and drop what was read when a later page is rate limited', async () => {
    const { source } = client([page([issue('ACME-1')], 'token-2'), json({}, 429)])

    expect(failureOf(await source.assignedIssues())?.code).toBe('DCK-JRA-004')
  })

  it('should fail with the not Jira code when an issue has another shape', async () => {
    const { source } = client([page([{ key: 'ACME-1', fields: {} }])])

    expect(failureOf(await source.assignedIssues())?.code).toBe('DCK-JRA-006')
  })

  it('should fail with the not Jira code when the update date is not a date', async () => {
    const { source } = client([page([issue('ACME-1', { updated: 'yesterday' })])])

    expect(failureOf(await source.assignedIssues())?.code).toBe('DCK-JRA-006')
  })
})
