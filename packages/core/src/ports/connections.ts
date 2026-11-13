import type { Connector } from '../connectors/connector.ts'
import type { ErrorCode } from '../errors.ts'

export interface ConnectedUser {
  readonly username: string
  readonly name: string
}

// The non-secret fields of an account, the ones a connector declares; they live in the settings file
export interface ConnectionFields {
  readonly url: string
  readonly email?: string
}

export type ConnectionStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'connected'; readonly url: string; readonly user: ConnectedUser }
  | { readonly kind: 'error'; readonly url: string | undefined; readonly code: ErrorCode }

// One connector's account. The token only goes in through `connect` and never comes out: the UI only
// receives the status
export interface Connection {
  status(): Promise<ConnectionStatus>
  connect(fields: ConnectionFields, token: string): Promise<ConnectionStatus>
  disconnect(): Promise<ConnectionStatus>
}

// A connector whose extension is in `extensions.disabled`; enabling the extension brings it back
export interface DisabledConnector {
  readonly extension: string
  readonly id: string
  readonly name: string
}

// Every enabled connector's account, by connector id
export interface Connections {
  // The enabled connectors that have an implementation, in the order they were declared
  list(): readonly Connector[]
  // The ones this app implements but the user disabled, so the interface can offer to enable them
  disabled(): readonly DisabledConnector[]
  status(id: string): Promise<ConnectionStatus>
  connect(id: string, fields: ConnectionFields, token: string): Promise<ConnectionStatus>
  disconnect(id: string): Promise<ConnectionStatus>
}
