import {
  type CodeReviewSource,
  type ErrorBody,
  errorBody,
  fail,
  type HttpClient,
  type HttpResponse,
  type MergeRequestSummary,
  ok,
  type PipelineState,
  type Result,
} from '@dck/core'
import type { z } from 'zod'
import { mergeRequestsSchema, userSchema } from './schemas.ts'

const PAGE_SIZE = 100
// Teto de segurança: 1000 itens por consulta bastam para uma visão do dia a dia
const MAX_PAGES = 10

export interface GitLabOptions {
  readonly http: HttpClient
  readonly baseUrl: string
  readonly token: string
}

// Aceita o endereço com ou sem /api/v4 e com barra no fim
export function normalizeBaseUrl(input: string): string {
  return input
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v4$/, '')
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
    return fail(errorBody('DCK-GLB-006', 'JSON inválido'))
  }
  const parsed = schema.safeParse(json)
  return parsed.success ? ok(parsed.data) : fail(errorBody('DCK-GLB-006'))
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

    const summaries: MergeRequestSummary[] = []
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
        summaries.push({
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
          pipeline: pipelineState(item.head_pipeline?.status),
        })
      }
      if (!response.value.headers['x-next-page']) break
    }
    return ok(summaries)
  }

  return { currentUser, mergeRequests }
}
