import type { Connector } from './connector.ts'

export const GITLAB_CONNECTOR = {
  id: 'gitlab',
  name: 'GitLab',
  connection: {
    address: { placeholder: 'https://gitlab.example.com' },
    token: { label: 'connections.gitlab.token', hint: 'connections.gitlab.token.hint' },
  },
  views: [
    {
      id: 'review',
      kind: 'mergeRequest',
      title: 'views.review',
      empty: 'views.empty.review',
      badge: 'views.waiting',
    },
    { id: 'mine', kind: 'mergeRequest', title: 'views.mine', empty: 'views.empty.mine' },
  ],
} as const satisfies Connector

export const GITLAB_EXTENSION = {
  id: 'dck.gitlab',
  name: 'GitLab',
  description: 'Merge requests waiting for your review and the ones you opened',
}
