import { parseServerUrl } from '../connections/url.ts'
import type { Connector } from './connector.ts'

export const GITHUB_DOT_COM = 'https://github.com'

export const GITHUB_CONNECTOR = {
  id: 'github',
  name: 'GitHub',
  ciTerm: 'checks',
  connection: {
    address: { placeholder: GITHUB_DOT_COM },
    token: {
      label: 'connections.github.token',
      hint: 'connections.github.token.hint',
      permissions: [
        'connections.github.permission.pulls',
        'connections.github.permission.statuses',
        'connections.github.permission.metadata',
        'connections.github.permission.classic',
      ],
    },
  },
  views: [
    {
      id: 'github-review',
      kind: 'mergeRequest',
      title: 'views.review',
      description: 'views.github.review.description',
      empty: 'views.empty.github.review',
      badge: 'review',
    },
    {
      id: 'github-mine',
      kind: 'mergeRequest',
      title: 'views.mine',
      description: 'views.github.mine.description',
      empty: 'views.empty.github.mine',
      badge: 'attention',
    },
  ],
} as const satisfies Connector

export const GITHUB_EXTENSION = {
  id: 'dck.github',
  name: 'GitHub',
  description: 'Pull requests waiting for your review and the ones you opened',
}

const API_HOST = 'api.github.com'

// The web root of github.com or of a GitHub Enterprise Server, which always lives at the root of its host;
// an empty address is github.com, and a pasted repository, pull request or API link keeps only the root
export function parseGitHubUrl(input: string): string | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return GITHUB_DOT_COM
  const url = URL.parse(trimmed)
  if (url === null || url.username || url.password) return undefined
  if (url.hostname === API_HOST && url.protocol === 'https:') return GITHUB_DOT_COM
  return parseServerUrl(url.origin)
}
