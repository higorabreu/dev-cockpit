import {
  type CodeReviewSource,
  type ConnectionStatus,
  type ErrorBody,
  errorCodeOf,
  type Logger,
  parseServerUrl,
  type SecretStore,
} from '@dck/core'
import type { ConnectionService } from './connector-connections.ts'

export interface GitLabConnectionDeps {
  readonly secrets: SecretStore
  // Token key in the keyring; comes from the profile, so dev mode does not touch the installed app's token
  readonly tokenKey: string
  readonly createSource: (url: string, token: string) => CodeReviewSource
  readonly address: {
    get(): string | null
    set(url: string | null): Promise<unknown>
  }
  readonly logger: Logger
}

export function createGitLabConnection(deps: GitLabConnectionDeps): ConnectionService {
  const { secrets, address, logger } = deps

  const failed = (url: string | undefined, body: ErrorBody): ConnectionStatus => {
    const code = errorCodeOf(body)
    logger.warn('gitlab connection failed', { url, code })
    return { kind: 'error', url, code }
  }

  async function check(url: string, token: string): Promise<ConnectionStatus> {
    const user = await deps.createSource(url, token).currentUser()
    if (!user.ok) return failed(url, user.error)
    return {
      kind: 'connected',
      url,
      user: { username: user.value.username, name: user.value.name },
    }
  }

  const forgetToken = async () => {
    const removed = await secrets.delete(deps.tokenKey)
    if (!removed.ok)
      logger.warn('could not remove the gitlab token', { code: errorCodeOf(removed.error) })
  }

  return {
    async status() {
      const url = address.get()
      if (!url) return { kind: 'none' }
      const token = await secrets.get(deps.tokenKey)
      if (!token.ok) return failed(url, token.error)
      if (token.value === undefined) return { kind: 'none' }
      return check(url, token.value)
    },

    async connect(fields, token) {
      const url = parseServerUrl(fields.url)
      if (!url) {
        logger.warn('gitlab address rejected')
        return { kind: 'error', url: undefined, code: 'DCK-GLB-007' }
      }
      const status = await check(url, token)
      if (status.kind !== 'connected') return status
      const stored = await secrets.set(deps.tokenKey, token)
      if (!stored.ok) return failed(url, stored.error)
      await address.set(url)
      logger.info('gitlab connected', { url, user: status.user.username })
      return status
    },

    async disconnect() {
      await forgetToken()
      await address.set(null)
      logger.info('gitlab disconnected')
      return { kind: 'none' }
    },

    forgetToken,
  }
}
