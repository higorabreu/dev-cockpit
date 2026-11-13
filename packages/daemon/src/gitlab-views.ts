import { join } from 'node:path'
import { createGitLabClient } from '@dck/adapter-gitlab'
import { createFetchHttpClient } from '@dck/adapter-node-fetch'
import { createSecretToolStore } from '@dck/adapter-secret-tool'
import {
  type CodeReviewSource,
  connectorTokenKey,
  createViewsService,
  errorBody,
  fail,
  GITLAB_CONNECTOR,
  type Logger,
  type MergeRequestView,
  ok,
  type ViewSource,
  type ViewsService,
} from '@dck/core'
import { createFileViewCache } from './file-view-cache.ts'

const isMergeRequestView = (view: string): view is MergeRequestView =>
  view === 'review' || view === 'mine'

// Each merge request becomes a view item of its kind
function mergeRequestViews(client: CodeReviewSource): ViewSource {
  return {
    async items(view) {
      if (!isMergeRequestView(view)) return fail(errorBody('DCK-IPC-003', `unknown view ${view}`))
      const result = await client.mergeRequests(view)
      return result.ok
        ? ok(result.value.map((item) => ({ kind: 'mergeRequest' as const, ...item })))
        : result
    },
  }
}

// The token comes from the keyring on every fetch and is never kept in the process
export function createGitLabViews(options: {
  stateDir: string
  logger: Logger
  // Same profile as the shell, so both read the same keyring key
  profile?: string
}): ViewsService {
  const { stateDir, logger } = options
  const tokenKey = connectorTokenKey(GITLAB_CONNECTOR.id, options.profile)
  const secrets = createSecretToolStore()
  const http = createFetchHttpClient()
  return createViewsService({
    views: GITLAB_CONNECTOR.views.map((view) => view.id),
    source: async (account) => {
      const token = await secrets.get(tokenKey)
      if (!token.ok) {
        logger.warn('could not read the gitlab token', { code: token.error.data?.code })
        return undefined
      }
      return token.value
        ? mergeRequestViews(createGitLabClient({ http, baseUrl: account.url, token: token.value }))
        : undefined
    },
    // The name from before connectors, so a stored list still shows on the first open
    cache: createFileViewCache(join(stateDir, 'views-cache.json'), logger),
    clock: { now: Date.now },
    logger,
  })
}
