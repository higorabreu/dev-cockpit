import { z } from 'zod'
import { parseServerUrl } from '../connections/url.ts'
import { LIMITS } from '../settings/settings.ts'
import type { Connector } from './connector.ts'

export const JIRA_CONNECTOR = {
  id: 'jira',
  name: 'Jira',
  connection: {
    address: { placeholder: 'https://acme.atlassian.net' },
    email: { placeholder: 'ana@example.com' },
    token: { label: 'connections.jira.token', hint: 'connections.jira.token.hint' },
  },
  views: [
    {
      id: 'tasks',
      kind: 'issue',
      title: 'views.tasks',
      description: 'views.tasks.description',
      empty: 'views.empty.tasks',
    },
  ],
} as const satisfies Connector

export const JIRA_EXTENSION = {
  id: 'dck.jira',
  name: 'Jira',
  description: 'The open Jira Cloud issues assigned to you',
}

// A Jira Cloud site lives at the root of its address, so a pasted board or issue link still finds it
export function parseJiraSiteUrl(input: string): string | undefined {
  const url = URL.parse(input.trim())
  if (url === null || url.username || url.password) return undefined
  return parseServerUrl(url.origin)
}

const emailSchema = z.string().trim().max(LIMITS.email.max).pipe(z.email())

// The e-mail of the Atlassian account, the user half of Basic authentication
export function parseAccountEmail(input: string): string | undefined {
  const parsed = emailSchema.safeParse(input)
  return parsed.success ? parsed.data : undefined
}
