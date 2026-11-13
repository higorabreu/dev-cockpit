import { createGitLabClient } from '@dck/adapter-gitlab'
import { createJiraClient } from '@dck/adapter-jira'
import {
  type Connection,
  type ConnectionFields,
  connectorTokenKey,
  GITLAB_CONNECTOR,
  type HttpClient,
  JIRA_CONNECTOR,
  type Logger,
  type SecretStore,
} from '@dck/core'
import { createGitLabConnection } from './gitlab-connection.ts'
import { createJiraConnection } from './jira-connection.ts'

export interface ConnectionService extends Connection {
  // The address was erased another way (file, restore all): the token is not left orphaned
  forgetToken(): Promise<void>
}

export interface ConnectorConnectionsDeps {
  readonly secrets: SecretStore
  readonly http: HttpClient
  // Same profile as the daemon, so both read the same keyring keys
  readonly profile: string | undefined
  // The non-secret fields kept in the settings for one connector; null erases them
  account(id: string): {
    get(): ConnectionFields | null
    set(fields: ConnectionFields | null): Promise<unknown>
  }
  readonly logger: Logger
}

// The connectors this app has code for, by id; a declared connector missing here is reported, not drawn
export function createConnectorConnections(
  deps: ConnectorConnectionsDeps,
): ReadonlyMap<string, ConnectionService> {
  const { secrets, http, logger } = deps
  const gitlabAccount = deps.account(GITLAB_CONNECTOR.id)
  const gitlab = createGitLabConnection({
    secrets,
    tokenKey: connectorTokenKey(GITLAB_CONNECTOR.id, deps.profile),
    createSource: (url, token) => createGitLabClient({ http, baseUrl: url, token }),
    address: {
      get: () => gitlabAccount.get()?.url ?? null,
      set: (url) => gitlabAccount.set(url === null ? null : { url }),
    },
    logger,
  })
  const jira = createJiraConnection({
    secrets,
    tokenKey: connectorTokenKey(JIRA_CONNECTOR.id, deps.profile),
    createSource: ({ url, email }, token) => createJiraClient({ http, baseUrl: url, email, token }),
    account: deps.account(JIRA_CONNECTOR.id),
    logger,
  })
  return new Map([
    [GITLAB_CONNECTOR.id, gitlab],
    [JIRA_CONNECTOR.id, jira],
  ])
}
