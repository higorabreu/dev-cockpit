import { z } from 'zod'
import { defineContributionPoint } from '../extensions/contribution-points.ts'
import { type MessageKey, ptBR } from '../i18n/pt-BR.ts'
import type { PluralKey } from '../i18n/translator.ts'
import { VIEW_ID_MAX } from '../views/schema.ts'

// The id names the settings entry (`connections.<id>`) and the keyring key (`<id>.token`)
export const CONNECTOR_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const VIEW_ID_PATTERN = new RegExp(`^[a-z][a-zA-Z0-9-]{0,${VIEW_ID_MAX - 1}}$`)

// Texts a connector shows are catalog keys, so they are translated like the rest of the interface
const messageKey = z.custom<MessageKey>(
  (value) => typeof value === 'string' && Object.hasOwn(ptBR, value),
  'must be a key of the text catalogs',
)
const pluralKey = z.custom<PluralKey>(
  (value) => typeof value === 'string' && Object.hasOwn(ptBR, `${value}.other`),
  'must be a plural key of the text catalogs',
)

const field = z.strictObject({ placeholder: z.string().max(200) })

export const connectorViewSchema = z.strictObject({
  id: z.string().regex(VIEW_ID_PATTERN, 'must be a short lowercase id'),
  kind: z.enum(['mergeRequest', 'issue']),
  title: messageKey,
  empty: messageKey,
  // The rail badge counts this view's items; the text says what they are, for the screen reader
  badge: pluralKey.optional(),
})

export const connectorSchema = z.strictObject({
  id: z.string().regex(CONNECTOR_ID_PATTERN, 'must be a short lowercase id'),
  // A product name, the same in every language
  name: z.string().min(1).max(60),
  // What the user fills in to connect; an absent field is not asked for
  connection: z.strictObject({
    address: field,
    email: field.optional(),
    token: z.strictObject({ label: messageKey, hint: messageKey }),
  }),
  views: z.array(connectorViewSchema).min(1).max(8),
})

export type Connector = z.output<typeof connectorSchema>
export type ConnectorView = z.output<typeof connectorViewSchema>

// Until extensions can run code, a connector's implementation ships with the app, so only built-in extensions
// may declare one
export const connectorsPoint = defineContributionPoint(
  'connectors',
  z.array(connectorSchema).min(1).max(4),
  ['built-in'],
)
