import { join } from 'node:path'
import { createGitLabClient } from '@dck/adapter-gitlab'
import { createFetchHttpClient } from '@dck/adapter-node-fetch'
import { createSecretToolStore } from '@dck/adapter-secret-tool'
import { createViewsService, gitlabTokenKey, type Logger, type ViewsService } from '@dck/core'
import { createFileViewCache } from './file-view-cache.ts'

// The token comes from the keyring on every fetch and is never kept in the process
export function createGitLabViews(options: {
  stateDir: string
  logger: Logger
  // Same profile as the shell, so both read the same keyring key
  profile?: string
}): ViewsService {
  const { stateDir, logger } = options
  const tokenKey = gitlabTokenKey(options.profile)
  const secrets = createSecretToolStore()
  const http = createFetchHttpClient()
  return createViewsService({
    source: async (url) => {
      const token = await secrets.get(tokenKey)
      if (!token.ok) {
        logger.warn('could not read the gitlab token', { code: token.error.data?.code })
        return undefined
      }
      return token.value
        ? createGitLabClient({ http, baseUrl: url, token: token.value })
        : undefined
    },
    cache: createFileViewCache(join(stateDir, 'views-cache.json'), logger),
    clock: { now: Date.now },
    logger,
  })
}
