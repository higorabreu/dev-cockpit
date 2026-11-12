import {
  type CodeReviewSource,
  type ErrorBody,
  errorBody,
  fail,
  type HttpClient,
  type HttpResponse,
  type MergeRequestSummary,
  normalizeBaseUrl,
  ok,
  type PipelineState,
  type Result,
} from '@dck/core'
import type { z } from 'zod'
import { mergeRequestDetailSchema, mergeRequestsSchema, userSchema } from './schemas.ts'

const PAGE_SIZE = 100
// Safety ceiling: 1000 items per query is enough for a day-to-day view
const MAX_PAGES = 10
// Pipeline queries in parallel: few, so as not to burden the server
const DETAIL_CONCURRENCY = 5

export interface GitLabOptions {
  readonly http: HttpClient
  readonly baseUrl: string
  readonly token: string
}

const PIPELINES: Readonly<Record<string, PipelineState>> = {
  success: 'success',
  failed: 'failed',
  running: 'running',
  pending: 'pending',
  created: 'pending',
  waiting_for_resource: 'pending',
  preparing: 'pending',
  scheduled: 'pending',
  canceled: 'canceled',
  canceling: 'canceled',
}

const pipelineState = (status: string | undefined): PipelineState =>
  (status ? PIPELINES[status] : undefined) ?? 'none'

function failureOf(response: HttpResponse): ErrorBody | undefined {
  const { status } = response
  if (status < 400) return undefined
  const detail = `HTTP ${status}`
  if (status === 401) return errorBody('DCK-GLB-001', detail)
  if (status === 403) return errorBody('DCK-GLB-002', detail)
  if (status === 404) return errorBody('DCK-GLB-003', detail)
  if (status === 429) return errorBody('DCK-GLB-004', detail)
  return errorBody('DCK-GLB-005', detail)
}

function parseBody<S extends z.ZodType>(schema: S, body: string): Result<z.output<S>, ErrorBody> {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return fail(errorBody('DCK-GLB-006', 'invalid JSON'))
  }
  const parsed = schema.safeParse(json)
  return parsed.success ? ok(parsed.data) : fail(errorBody('DCK-GLB-006'))
}

async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export function createGitLabClient(options: GitLabOptions): CodeReviewSource {
  const base = normalizeBaseUrl(options.baseUrl)
  const headers = { 'private-token': options.token, accept: 'application/json' }

  const fetchPage = (path: string, params: URLSearchParams) =>
    options.http.get({ url: `${base}/api/v4${path}?${params}`, headers })

  async function currentUser() {
    const response = await fetchPage('/user', new URLSearchParams())
    if (!response.ok) return fail(response.error)
    const failure = failureOf(response.value)
    if (failure) return fail(failure)
    const user = parseBody(userSchema, response.value.body)
    if (!user.ok) return user
    return ok({ id: String(user.value.id), username: user.value.username, name: user.value.name })
  }

  async function mergeRequests(view: 'review' | 'mine') {
    const user = await currentUser()
    if (!user.ok) return user
    const params = new URLSearchParams({
      state: 'opened',
      scope: 'all',
      per_page: String(PAGE_SIZE),
      order_by: 'updated_at',
      sort: 'desc',
    })
    params.set(view === 'review' ? 'reviewer_id' : 'author_id', user.value.id)

    const found: { summary: MergeRequestSummary; projectId: number }[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      params.set('page', String(page))
      const response = await fetchPage('/merge_requests', params)
      if (!response.ok) return fail(response.error)
      const failure = failureOf(response.value)
      if (failure) return fail(failure)
      const items = parseBody(mergeRequestsSchema, response.value.body)
      if (!items.ok) return items
      for (const item of items.value) {
        const { full } = item.references
        found.push({
          projectId: item.project_id,
          summary: {
            id: full,
            number: item.iid,
            title: item.title,
            url: item.web_url,
            project: full.slice(0, full.lastIndexOf('!')),
            author: item.author.username,
            sourceBranch: item.source_branch,
            targetBranch: item.target_branch,
            draft: item.draft,
            updatedAt: item.updated_at,
            hasConflicts: item.has_conflicts,
            openDiscussions: !item.blocking_discussions_resolved,
            pipeline: 'unknown',
          },
        })
      }
      if (!response.value.headers['x-next-page']) break
    }
    const summaries = await mapLimit(found, DETAIL_CONCURRENCY, async ({ summary, projectId }) => ({
      ...summary,
      pipeline: await pipelineOf(projectId, summary.number),
    }))
    return ok(summaries)
  }

  // A failure to query one MR does not bring down the list: its pipeline becomes `unknown`
  async function pipelineOf(projectId: number, number: number): Promise<PipelineState> {
    const response = await fetchPage(
      `/projects/${projectId}/merge_requests/${number}`,
      new URLSearchParams(),
    )
    if (!response.ok || failureOf(response.value)) return 'unknown'
    const detail = parseBody(mergeRequestDetailSchema, response.value.body)
    return detail.ok ? pipelineState(detail.value.head_pipeline?.status) : 'unknown'
  }

  return { currentUser, mergeRequests }
}
