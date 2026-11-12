import { join } from 'node:path'
import { createGitLabClient } from '@dck/adapter-gitlab'
import { createFetchHttpClient } from '@dck/adapter-node-fetch'
import { createSecretToolStore } from '@dck/adapter-secret-tool'
import { createViewsService, type Logger, type ViewsService } from '@dck/core'
import { createFileViewCache } from './file-view-cache.ts'

// O token vem do cofre a cada busca, nunca fica guardado no processo
export function createGitLabViews(options: { stateDir: string; logger: Logger }): ViewsService {
  const { stateDir, logger } = options
  const secrets = createSecretToolStore()
  const http = createFetchHttpClient()
  return createViewsService({
    source: async (url) => {
      const token = await secrets.get('gitlab.token')
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
