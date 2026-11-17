import { createGitHubClient, createRateGate, type RateGate } from '@dck/adapter-github'
import { createGitLabClient } from '@dck/adapter-gitlab'
import { createFetchHttpClient } from '@dck/adapter-node-fetch'
import {
  GITHUB_CONNECTOR,
  GITLAB_CONNECTOR,
  JIRA_CONNECTOR,
  type Logger,
  type SecretStore,
  type ViewsService,
} from '@dck/core'
import { createCodeReviewViews } from './code-review-views.ts'
import { createJiraViews } from './jira-views.ts'

export interface ConnectorViewsOptions {
  readonly stateDir: string
  readonly logger: Logger
  // The store the window writes the tokens to
  readonly secrets: SecretStore
  // Same profile as the shell, so both read the same keyring keys
  readonly profile?: string
}

// Which list of the code review port each declared view shows
export const CODE_REVIEW_LISTS = {
  [GITHUB_CONNECTOR.id]: { 'github-review': 'review', 'github-mine': 'mine' },
  [GITLAB_CONNECTOR.id]: { review: 'review', mine: 'mine' },
} as const

// One gate per address for the daemon's whole life, so a rate limit holds from one refresh to the next
function gitHubGates(): (url: string) => RateGate {
  const gates = new Map<string, RateGate>()
  return (url) => {
    const found = gates.get(url) ?? createRateGate({ now: Date.now })
    gates.set(url, found)
    return found
  }
}

// The connectors this daemon has code for, by id; one views service each, with its own cache file
export function createConnectorViews(
  options: ConnectorViewsOptions,
): ReadonlyMap<string, ViewsService> {
  const http = createFetchHttpClient()
  const gateOf = gitHubGates()
  return new Map([
    [
      GITHUB_CONNECTOR.id,
      createCodeReviewViews({
        ...options,
        connector: GITHUB_CONNECTOR,
        lists: CODE_REVIEW_LISTS.github,
        cacheFile: 'github-views-cache.json',
        createSource: (url, token) =>
          createGitHubClient({ http, baseUrl: url, token, gate: gateOf(url) }),
      }),
    ],
    [
      GITLAB_CONNECTOR.id,
      createCodeReviewViews({
        ...options,
        connector: GITLAB_CONNECTOR,
        lists: CODE_REVIEW_LISTS.gitlab,
        // The name from before connectors, so a stored list still shows on the first open
        cacheFile: 'views-cache.json',
        createSource: (url, token) => createGitLabClient({ http, baseUrl: url, token }),
      }),
    ],
    [JIRA_CONNECTOR.id, createJiraViews(options)],
  ])
}
