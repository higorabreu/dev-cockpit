import { Buffer } from 'node:buffer'
import {
  type ErrorBody,
  errorBody,
  fail,
  type HttpClient,
  type HttpResponse,
  type IssueSummary,
  type IssueTrackerSource,
  normalizeBaseUrl,
  ok,
  type Result,
} from '@dck/core'
import type { z } from 'zod'
import { myselfSchema, searchPageSchema } from './schemas.ts'

const PAGE_SIZE = 100
// Safety ceiling: 1000 tasks is more than anyone works through; the most recently updated come first
const MAX_PAGES = 10
const ASSIGNED_OPEN = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
const FIELDS = 'summary,status,issuetype,project,updated'

export interface JiraOptions {
  readonly http: HttpClient
  // The site address, such as https://acme.atlassian.net
  readonly baseUrl: string
  readonly email: string
  readonly token: string
}

// The detail names the endpoint and the status, never the account
function failureOf(response: HttpResponse, path: string): ErrorBody | undefined {
  const { status } = response
  if (status < 400) return undefined
  const detail = `HTTP ${status} ${path}`
  if (status === 401) return errorBody('DCK-JRA-001', detail)
  if (status === 403) return errorBody('DCK-JRA-002', detail)
  if (status === 404) return errorBody('DCK-JRA-003', detail)
  if (status === 429) return errorBody('DCK-JRA-004', detail)
  return errorBody('DCK-JRA-005', detail)
}

function parseBody<S extends z.ZodType>(
  schema: S,
  body: string,
  path: string,
): Result<z.output<S>, ErrorBody> {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return fail(errorBody('DCK-JRA-006', `invalid JSON from ${path}`))
  }
  const parsed = schema.safeParse(json)
  return parsed.success
    ? ok(parsed.data)
    : fail(errorBody('DCK-JRA-006', `unexpected shape from ${path}`))
}

// Jira Cloud REST API v3, read only, with Basic authentication by account e-mail and API token
export function createJiraClient(options: JiraOptions): IssueTrackerSource {
  const base = normalizeBaseUrl(options.baseUrl)
  const credentials = Buffer.from(`${options.email}:${options.token}`, 'utf8').toString('base64')
  const headers = { authorization: `Basic ${credentials}`, accept: 'application/json' }

  async function get<S extends z.ZodType>(
    path: string,
    params: URLSearchParams,
    schema: S,
  ): Promise<Result<z.output<S>, ErrorBody>> {
    const query = params.size > 0 ? `?${params}` : ''
    const response = await options.http.get({ url: `${base}${path}${query}`, headers })
    if (!response.ok) return fail(response.error)
    const failure = failureOf(response.value, path)
    if (failure) return fail(failure)
    return parseBody(schema, response.value.body, path)
  }

  async function currentUser() {
    const user = await get('/rest/api/3/myself', new URLSearchParams(), myselfSchema)
    if (!user.ok) return user
    return ok({ id: user.value.accountId, name: user.value.displayName })
  }

  // The old `/rest/api/3/search` was retired in 2025; `search/jql` pages with a token instead of an offset
  async function assignedIssues() {
    const params = new URLSearchParams({
      jql: ASSIGNED_OPEN,
      fields: FIELDS,
      maxResults: String(PAGE_SIZE),
    })
    const found: IssueSummary[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await get('/rest/api/3/search/jql', params, searchPageSchema)
      if (!result.ok) return result
      for (const { id, key, fields } of result.value.issues) {
        const category = fields.status.statusCategory.key
        // The query leaves finished issues out; one finished meanwhile is left out too
        if (category === 'done') continue
        found.push({
          id,
          key,
          summary: fields.summary,
          url: `${base}/browse/${encodeURIComponent(key)}`,
          project: fields.project.key,
          type: fields.issuetype.name,
          status: fields.status.name,
          statusCategory: category === 'indeterminate' ? 'progress' : 'todo',
          updatedAt: fields.updated,
        })
      }
      const next = result.value.nextPageToken
      if (!next || result.value.isLast === true) break
      params.set('nextPageToken', next)
    }
    return ok(found)
  }

  return { currentUser, assignedIssues }
}
