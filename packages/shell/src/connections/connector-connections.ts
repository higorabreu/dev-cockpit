import { createGitHubClient } from '@dck/adapter-github'
import { createGitLabClient } from '@dck/adapter-gitlab'
import { createJiraClient } from '@dck/adapter-jira'
import {
  type Connection,
  type ConnectionFields,
  connectorTokenKey,
  GITHUB_CONNECTOR,
  GITLAB_CONNECTOR,
  type HttpClient,
  JIRA_CONNECTOR,
  type Logger,
  parseGitHubUrl,
  parseServerUrl,
  type SecretStore,
} from '@dck/core'
import { createCodeReviewConnection } from './code-review-connection.ts'
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
  // A code review account keeps only its address in the settings
  const address = (id: string) => {
    const account = deps.account(id)
    return {
      get: () => account.get()?.url ?? null,
      set: (url: string | null) => account.set(url === null ? null : { url }),
    }
  }
  const gitlab = createCodeReviewConnection({
    service: GITLAB_CONNECTOR.id,
    secrets,
    tokenKey: connectorTokenKey(GITLAB_CONNECTOR.id, deps.profile),
    parseAddress: parseServerUrl,
    invalidAddress: 'DCK-GLB-007',
    createSource: (url, token) => createGitLabClient({ http, baseUrl: url, token }),
    address: address(GITLAB_CONNECTOR.id),
    logger,
  })
  const github = createCodeReviewConnection({
    service: GITHUB_CONNECTOR.id,
    secrets,
    tokenKey: connectorTokenKey(GITHUB_CONNECTOR.id, deps.profile),
    parseAddress: parseGitHubUrl,
    invalidAddress: 'DCK-GHB-007',
    createSource: (url, token) => createGitHubClient({ http, baseUrl: url, token }),
    address: address(GITHUB_CONNECTOR.id),
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
    [GITHUB_CONNECTOR.id, github],
    [GITLAB_CONNECTOR.id, gitlab],
    [JIRA_CONNECTOR.id, jira],
  ])
}
