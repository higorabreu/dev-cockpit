import { join } from 'node:path'
import { createJiraClient } from '@dck/adapter-jira'
import { createFetchHttpClient } from '@dck/adapter-node-fetch'
import {
  connectorTokenKey,
  createViewsService,
  errorBody,
  fail,
  type IssueTrackerSource,
  JIRA_CONNECTOR,
  type Logger,
  ok,
  type SecretStore,
  type ViewSource,
  type ViewsService,
} from '@dck/core'
import { createFileViewCache } from './file-view-cache.ts'

const TASKS_VIEW = JIRA_CONNECTOR.views[0].id

// Each assigned issue becomes a view item of its kind
export function taskViews(client: IssueTrackerSource): ViewSource {
  return {
    async items(view) {
      if (view !== TASKS_VIEW) return fail(errorBody('DCK-IPC-003', `unknown view ${view}`))
      const result = await client.assignedIssues()
      return result.ok
        ? ok(result.value.map((item) => ({ kind: 'issue' as const, ...item })))
        : result
    },
  }
}

// The token comes from the keyring on every fetch and is never kept in the process
export function createJiraViews(options: {
  stateDir: string
  logger: Logger
  secrets: SecretStore
  // Same profile as the shell, so both read the same keyring key
  profile?: string
}): ViewsService {
  const { stateDir, logger, secrets } = options
  const tokenKey = connectorTokenKey(JIRA_CONNECTOR.id, options.profile)
  const http = createFetchHttpClient()
  return createViewsService({
    views: JIRA_CONNECTOR.views.map((view) => view.id),
    source: async ({ url, email }) => {
      if (email === undefined) return undefined
      const token = await secrets.get(tokenKey)
      if (!token.ok) {
        logger.warn('could not read the jira token', { code: token.error.data?.code })
        return undefined
      }
      return token.value
        ? taskViews(createJiraClient({ http, baseUrl: url, email, token: token.value }))
        : undefined
    },
    cache: createFileViewCache(join(stateDir, 'jira-views-cache.json'), logger),
    clock: { now: Date.now },
    logger,
  })
}
