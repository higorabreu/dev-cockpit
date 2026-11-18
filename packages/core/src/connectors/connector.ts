import { z } from 'zod'
import { defineContributionPoint } from '../extensions/contribution-points.ts'
import { type MessageKey, ptBR } from '../i18n/pt-BR.ts'
import { VIEW_ID_MAX } from '../views/schema.ts'

// The id names the settings entry (`connections.<id>`) and the keyring key (`<id>.token`)
export const CONNECTOR_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const VIEW_ID_PATTERN = new RegExp(`^[a-z][a-zA-Z0-9-]{0,${VIEW_ID_MAX - 1}}$`)

// Texts a connector shows are catalog keys, so they are translated like the rest of the interface
const messageKey = z.custom<MessageKey>(
  (value) => typeof value === 'string' && Object.hasOwn(ptBR, value),
  'must be a key of the text catalogs',
)

const field = z.strictObject({ placeholder: z.string().max(200) })

export const BADGE_ROLES = ['review', 'attention'] as const

export const connectorViewSchema = z.strictObject({
  id: z.string().regex(VIEW_ID_PATTERN, 'must be a short lowercase id'),
  kind: z.enum(['mergeRequest', 'issue']),
  title: messageKey,
  // What the tab's list holds, shown in its tooltip
  description: messageKey,
  empty: messageKey,
  // What this view counts toward the dot on the Work button: `review` every item, `attention` the user's
  // own merge requests that need them (`needsAttention`)
  badge: z.enum(BADGE_ROLES).optional(),
})

export type BadgeRole = (typeof BADGE_ROLES)[number]

// The service's own word for the CI state of a merge request: GitLab's pipeline, GitHub's checks
export const CI_TERMS = ['pipeline', 'checks'] as const
export type CiTerm = (typeof CI_TERMS)[number]

export const connectorSchema = z.strictObject({
  id: z.string().regex(CONNECTOR_ID_PATTERN, 'must be a short lowercase id'),
  // A product name, the same in every language
  name: z.string().min(1).max(60),
  // `pipeline` when absent
  ciTerm: z.enum(CI_TERMS).optional(),
  // What the user fills in to connect; an absent field is not asked for
  connection: z.strictObject({
    address: field,
    email: field.optional(),
    // `permissions` lists what the token needs, shown on demand under the hint
    token: z.strictObject({
      label: messageKey,
      hint: messageKey,
      permissions: z.array(messageKey).min(1).max(6).optional(),
    }),
  }),
  views: z.array(connectorViewSchema).min(1).max(8),
})

export type Connector = z.output<typeof connectorSchema>
export type ConnectorView = z.output<typeof connectorViewSchema>

// A view id names the view across the whole product (host channels, daemon, cache), so it is never shared
function clash(
  connectors: readonly Connector[],
  earlier: readonly Connector[],
): string | undefined {
  const connectorIds = new Set<string>()
  const viewOwners = new Map<string, string>()
  for (const connector of earlier) {
    connectorIds.add(connector.id)
    for (const view of connector.views) viewOwners.set(view.id, connector.id)
  }
  for (const connector of connectors) {
    if (connectorIds.has(connector.id)) return `connector id ${connector.id} is already used`
    connectorIds.add(connector.id)
    for (const view of connector.views) {
      const owner = viewOwners.get(view.id)
      if (owner !== undefined) return `view id ${view.id} is already used by connector ${owner}`
      viewOwners.set(view.id, connector.id)
    }
  }
  return undefined
}

// Until extensions can run code, a connector's implementation ships with the app, so only built-in extensions
// may declare one
export const connectorsPoint = defineContributionPoint(
  'connectors',
  z
    .array(connectorSchema)
    .min(1)
    .max(4)
    .superRefine((connectors, context) => {
      const reason = clash(connectors, [])
      if (reason !== undefined) context.addIssue({ code: 'custom', message: reason })
    }),
  {
    sources: ['built-in'],
    conflict: (connectors, earlier) => clash(connectors, earlier.flat()),
  },
)
