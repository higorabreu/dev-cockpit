import { GITLAB_CONNECTOR, type Logger, type ViewsService } from '@dck/core'
import { createGitLabViews } from './gitlab-views.ts'

export interface ConnectorViewsOptions {
  readonly stateDir: string
  readonly logger: Logger
  // Same profile as the shell, so both read the same keyring keys
  readonly profile?: string
}

// The connectors this daemon has code for, by id; one views service each, with its own cache file
export function createConnectorViews(
  options: ConnectorViewsOptions,
): ReadonlyMap<string, ViewsService> {
  return new Map([[GITLAB_CONNECTOR.id, createGitLabViews(options)]])
}
