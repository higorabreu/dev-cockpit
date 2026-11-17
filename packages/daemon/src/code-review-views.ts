import { join } from 'node:path'
import {
  type CodeReviewSource,
  type Connector,
  connectorTokenKey,
  createViewsService,
  errorBody,
  fail,
  type Logger,
  type MergeRequestView,
  ok,
  type SecretStore,
  type ViewSource,
  type ViewsService,
} from '@dck/core'
import { createFileViewCache } from './file-view-cache.ts'

// Each merge request becomes a view item of its kind; `lists` says which list each declared view shows
export function mergeRequestViews(
  client: CodeReviewSource,
  lists: Readonly<Record<string, MergeRequestView>>,
): ViewSource {
  return {
    async items(view) {
      const list = Object.hasOwn(lists, view) ? lists[view] : undefined
      if (list === undefined) return fail(errorBody('DCK-IPC-003', `unknown view ${view}`))
      const result = await client.mergeRequests(list)
      return result.ok
        ? ok(result.value.map((item) => ({ kind: 'mergeRequest' as const, ...item })))
        : result
    },
  }
}

export interface CodeReviewViewsOptions {
  readonly stateDir: string
  readonly logger: Logger
  readonly secrets: SecretStore
  // Same profile as the shell, so both read the same keyring key
  readonly profile?: string
  readonly connector: Connector
  readonly lists: Readonly<Record<string, MergeRequestView>>
  // The file in the state directory that keeps the last lists of this connector
  readonly cacheFile: string
  createSource(url: string, token: string): CodeReviewSource
}

// The token comes from the keyring on every fetch and is never kept in the process
export function createCodeReviewViews(options: CodeReviewViewsOptions): ViewsService {
  const { stateDir, logger, secrets, connector } = options
  const tokenKey = connectorTokenKey(connector.id, options.profile)
  return createViewsService({
    views: connector.views.map((view) => view.id),
    source: async (account) => {
      const token = await secrets.get(tokenKey)
      if (!token.ok) {
        logger.warn(`could not read the ${connector.id} token`, { code: token.error.data?.code })
        return undefined
      }
      return token.value
        ? mergeRequestViews(options.createSource(account.url, token.value), options.lists)
        : undefined
    },
    cache: createFileViewCache(join(stateDir, options.cacheFile), logger),
    clock: { now: Date.now },
    logger,
  })
}
