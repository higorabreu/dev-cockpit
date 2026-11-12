import {
  type CodeReviewSource,
  type ConnectionStatus,
  type ErrorBody,
  errorCodeOf,
  type GitLabConnection,
  type Logger,
  parseServerUrl,
  type SecretStore,
} from '@dck/core'

export interface GitLabConnectionDeps {
  readonly secrets: SecretStore
  // Chave do token no cofre; vem do perfil, para o modo dev não mexer no token do app instalado
  readonly tokenKey: string
  readonly createSource: (url: string, token: string) => CodeReviewSource
  readonly address: {
    get(): string | null
    set(url: string | null): Promise<unknown>
  }
  readonly logger: Logger
}

export interface GitLabConnectionService extends GitLabConnection {
  // O endereço foi apagado por outro caminho (arquivo, restaurar tudo): o token não fica órfão
  forgetToken(): Promise<void>
}

export function createGitLabConnection(deps: GitLabConnectionDeps): GitLabConnectionService {
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

    async connect(rawUrl, token) {
      const url = parseServerUrl(rawUrl)
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
