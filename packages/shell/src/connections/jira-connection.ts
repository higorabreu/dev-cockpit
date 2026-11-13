import {
  type ConnectionFields,
  type ConnectionStatus,
  type ErrorBody,
  errorCodeOf,
  type IssueTrackerSource,
  type Logger,
  parseAccountEmail,
  parseJiraSiteUrl,
  type SecretStore,
} from '@dck/core'
import type { ConnectionService } from './connector-connections.ts'

export interface JiraAccount {
  readonly url: string
  readonly email: string
}

export interface JiraConnectionDeps {
  readonly secrets: SecretStore
  // Token key in the keyring; comes from the profile, so dev mode does not touch the installed app's token
  readonly tokenKey: string
  readonly createSource: (account: JiraAccount, token: string) => IssueTrackerSource
  // The address and the e-mail kept in the settings; the token never goes there
  readonly account: {
    get(): ConnectionFields | null
    set(fields: ConnectionFields | null): Promise<unknown>
  }
  readonly logger: Logger
}

// The e-mail is personal data, so the logs carry only the site address and the code
export function createJiraConnection(deps: JiraConnectionDeps): ConnectionService {
  const { secrets, account, logger } = deps

  const failed = (url: string | undefined, body: ErrorBody): ConnectionStatus => {
    const code = errorCodeOf(body)
    logger.warn('jira connection failed', { url, code })
    return { kind: 'error', url, code }
  }

  const refused = (code: 'DCK-JRA-007' | 'DCK-JRA-008'): ConnectionStatus => {
    logger.warn('jira account refused before checking', { code })
    return { kind: 'error', url: undefined, code }
  }

  // Jira Cloud has no username; the display name is what the user recognizes
  async function check(stored: JiraAccount, token: string): Promise<ConnectionStatus> {
    const user = await deps.createSource(stored, token).currentUser()
    if (!user.ok) return failed(stored.url, user.error)
    return {
      kind: 'connected',
      url: stored.url,
      user: { username: user.value.name, name: user.value.name },
    }
  }

  const forgetToken = async () => {
    const removed = await secrets.delete(deps.tokenKey)
    if (!removed.ok)
      logger.warn('could not remove the jira token', { code: errorCodeOf(removed.error) })
  }

  return {
    async status() {
      const stored = account.get()
      if (!stored?.url || !stored.email) return { kind: 'none' }
      const token = await secrets.get(deps.tokenKey)
      if (!token.ok) return failed(stored.url, token.error)
      if (token.value === undefined) return { kind: 'none' }
      return check({ url: stored.url, email: stored.email }, token.value)
    },

    async connect(fields, token) {
      const url = parseJiraSiteUrl(fields.url)
      if (!url) return refused('DCK-JRA-007')
      const email = parseAccountEmail(fields.email ?? '')
      if (!email) return refused('DCK-JRA-008')
      const status = await check({ url, email }, token)
      if (status.kind !== 'connected') return status
      const stored = await secrets.set(deps.tokenKey, token)
      if (!stored.ok) return failed(url, stored.error)
      await account.set({ url, email })
      logger.info('jira connected', { url })
      return status
    },

    async disconnect() {
      await forgetToken()
      await account.set(null)
      logger.info('jira disconnected')
      return { kind: 'none' }
    },

    forgetToken,
  }
}
