import { createGitLabClient } from '@dck/adapter-gitlab'
import {
  type Connection,
  connectorTokenKey,
  GITLAB_CONNECTOR,
  type HttpClient,
  type Logger,
  type SecretStore,
} from '@dck/core'
import { createGitLabConnection } from './gitlab-connection.ts'

export interface ConnectionService extends Connection {
  // The address was erased another way (file, restore all): the token is not left orphaned
  forgetToken(): Promise<void>
}

export interface ConnectorConnectionsDeps {
  readonly secrets: SecretStore
  readonly http: HttpClient
  // Same profile as the daemon, so both read the same keyring keys
  readonly profile: string | undefined
  // The address kept in the settings for one connector
  address(id: string): { get(): string | null; set(url: string | null): Promise<unknown> }
  readonly logger: Logger
}

// The connectors this app has code for, by id; a declared connector missing here is reported, not drawn
export function createConnectorConnections(
  deps: ConnectorConnectionsDeps,
): ReadonlyMap<string, ConnectionService> {
  const { secrets, http, logger } = deps
  const gitlab = createGitLabConnection({
    secrets,
    tokenKey: connectorTokenKey(GITLAB_CONNECTOR.id, deps.profile),
    createSource: (url, token) => createGitLabClient({ http, baseUrl: url, token }),
    address: deps.address(GITLAB_CONNECTOR.id),
    logger,
  })
  return new Map([[GITLAB_CONNECTOR.id, gitlab]])
}
