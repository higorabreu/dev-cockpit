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
import { createRateGate, type RateGate, type RateResource } from './rate-gate.ts'
import {
  checkRunsSchema,
  combinedStatusSchema,
  pullSchema,
  searchSchema,
  userSchema,
} from './schemas.ts'

const PAGE_SIZE = 100
// The search answers 30 requests a minute: 500 pull requests per list is plenty for a day-to-day view
const MAX_PAGES = 5
// Lookups per pull request in parallel: few, so as not to burden the server
const DETAIL_CONCURRENCY = 5
// The per-row lookups stop while fewer requests than this are left, so the lists keep loading
const CORE_RESERVE = 100
// Pinned so a change to the API's default shape does not reach the schemas unannounced
const API_VERSION = '2022-11-28'

export interface GitHubOptions {
  readonly http: HttpClient
  // The web root: https://github.com or a GitHub Enterprise Server address
  readonly baseUrl: string
  readonly token: string
  // Shared by the clients of one account, so a limit holds across refreshes; one of its own when absent
  readonly gate?: RateGate
}

// github.com serves its API on its own host; GitHub Enterprise Server under /api/v3
export function gitHubApiRoot(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl).replace(/\/api\/v3$/, '')
  return URL.parse(base)?.hostname === 'github.com' ? 'https://api.github.com' : `${base}/api/v3`
}

const CONCLUSIONS: Readonly<Record<string, PipelineState>> = {
  success: 'success',
  neutral: 'success',
  skipped: 'success',
  failure: 'failed',
  timed_out: 'failed',
  action_required: 'failed',
  startup_failure: 'failed',
  cancelled: 'canceled',
  stale: 'pending',
}

const STATUSES: Readonly<Record<string, PipelineState>> = {
  success: 'success',
  failure: 'failed',
  error: 'failed',
  pending: 'pending',
}

// The strongest state wins: a failure needs the author first, then what is still running
const PRIORITY: readonly PipelineState[] = ['failed', 'running', 'pending', 'canceled', 'success']

export function ciState(states: readonly PipelineState[]): PipelineState {
  return PRIORITY.find((state) => states.includes(state)) ?? 'none'
}

const checkRunState = (run: { status: string; conclusion?: string | null }): PipelineState => {
  if (run.status !== 'completed') return run.status === 'in_progress' ? 'running' : 'pending'
  return (run.conclusion ? CONCLUSIONS[run.conclusion] : undefined) ?? 'success'
}

function failureOf(response: HttpResponse): ErrorBody | undefined {
  const { status } = response
  if (status < 400) return undefined
  const detail = `HTTP ${status}`
  if (status === 401) return errorBody('DCK-GHB-001', detail)
  if (status === 403) return errorBody('DCK-GHB-002', detail)
  if (status === 404) return errorBody('DCK-GHB-003', detail)
  return errorBody('DCK-GHB-005', detail)
}

function parseBody<S extends z.ZodType>(schema: S, body: string): Result<z.output<S>, ErrorBody> {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return fail(errorBody('DCK-GHB-006', 'invalid JSON'))
  }
  const parsed = schema.safeParse(json)
  return parsed.success ? ok(parsed.data) : fail(errorBody('DCK-GHB-006'))
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

const hasNextPage = (response: HttpResponse) => /rel="next"/.test(response.headers.link ?? '')

const repositoryPath = (repository: string) =>
  `/repos/${repository.split('/').map(encodeURIComponent).join('/')}`

export function createGitHubClient(options: GitHubOptions): CodeReviewSource {
  const root = gitHubApiRoot(options.baseUrl)
  const gate = options.gate ?? createRateGate({ now: Date.now })
  const headers = {
    authorization: `Bearer ${options.token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': API_VERSION,
    'user-agent': 'dev-cockpit',
  }

  // A resource the server limited is not called again before its reset
  async function get(
    resource: RateResource,
    path: string,
    params = new URLSearchParams(),
  ): Promise<Result<HttpResponse, ErrorBody>> {
    const wait = gate.waitFor(resource)
    if (wait > 0)
      return fail(errorBody('DCK-GHB-004', `${resource} limited for ${Math.ceil(wait / 1000)} s`))
    const response = await options.http.get({ url: `${root}${path}?${params}`, headers })
    if (!response.ok) return response
    if (gate.record(resource, response.value))
      return fail(errorBody('DCK-GHB-004', `HTTP ${response.value.status} on ${resource}`))
    const failure = failureOf(response.value)
    return failure ? fail(failure) : response
  }

  const lowOnRequests = () =>
    gate.waitFor('core') > 0 || (gate.remaining('core') ?? Number.POSITIVE_INFINITY) <= CORE_RESERVE

  async function currentUser() {
    const response = await get('core', '/user')
    if (!response.ok) return response
    const user = parseBody(userSchema, response.value.body)
    if (!user.ok) return user
    const { id, login, name } = user.value
    return ok({ id: String(id), username: login, name: name || login })
  }

  // The login rather than `@me`, which older Enterprise servers may not know; `review-requested` also
  // matches a request made to one of the user's teams
  async function mergeRequests(view: 'review' | 'mine') {
    const user = await currentUser()
    if (!user.ok) return user
    const qualifier = view === 'review' ? 'review-requested' : 'author'
    const params = new URLSearchParams({
      q: `is:pr is:open archived:false ${qualifier}:${user.value.username}`,
      sort: 'updated',
      order: 'desc',
      per_page: String(PAGE_SIZE),
    })

    const found: MergeRequestSummary[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      params.set('page', String(page))
      const response = await get('search', '/search/issues', params)
      if (!response.ok) return response
      const result = parseBody(searchSchema, response.value.body)
      if (!result.ok) return result
      for (const item of result.value.items) {
        if (item.pull_request === undefined) continue
        const repository = item.repository_url
        found.push({
          id: `${repository}#${item.number}`,
          number: item.number,
          title: item.title,
          url: item.html_url,
          project: repository,
          author: item.user?.login ?? '',
          sourceBranch: '',
          targetBranch: '',
          draft: item.draft,
          updatedAt: item.updated_at,
          hasConflicts: false,
          // The REST API does not say whether review threads are resolved
          openDiscussions: false,
          pipeline: 'unknown',
          referenceMark: '#',
        })
      }
      if (!hasNextPage(response.value)) break
    }
    return ok(await mapLimit(found, DETAIL_CONCURRENCY, detailed))
  }

  // A failed lookup does not bring down the list: that row keeps no branch or an `unknown` CI state
  async function detailed(summary: MergeRequestSummary): Promise<MergeRequestSummary> {
    if (lowOnRequests()) return summary
    const response = await get('core', `${repositoryPath(summary.project)}/pulls/${summary.number}`)
    if (!response.ok) return summary
    const pull = parseBody(pullSchema, response.value.body)
    if (!pull.ok) return summary
    return {
      ...summary,
      sourceBranch: pull.value.head.ref,
      targetBranch: pull.value.base.ref,
      draft: pull.value.draft,
      hasConflicts: pull.value.mergeable === false,
      pipeline: await ciOf(summary.project, pull.value.head.sha),
    }
  }

  // GitHub Actions and most CI apps report check runs; older services report commit statuses
  async function ciOf(repository: string, sha: string): Promise<PipelineState> {
    if (lowOnRequests()) return 'unknown'
    const commit = `${repositoryPath(repository)}/commits/${encodeURIComponent(sha)}`
    const [runs, statuses] = await Promise.all([
      get('core', `${commit}/check-runs`, new URLSearchParams({ per_page: '100' })),
      get('core', `${commit}/status`),
    ])
    const checks = runs.ok ? parseBody(checkRunsSchema, runs.value.body) : runs
    const combined = statuses.ok ? parseBody(combinedStatusSchema, statuses.value.body) : statuses
    if (!checks.ok && !combined.ok) return 'unknown'
    const states: PipelineState[] = checks.ok ? checks.value.check_runs.map(checkRunState) : []
    if (combined.ok && combined.value.total_count > 0)
      states.push(STATUSES[combined.value.state] ?? 'pending')
    // One source failed and the other has nothing: the state is not known, not absent
    if (states.length === 0 && (!checks.ok || !combined.ok)) return 'unknown'
    return ciState(states)
  }

  return { currentUser, mergeRequests }
}
