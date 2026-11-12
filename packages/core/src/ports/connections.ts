import type { ErrorCode } from '../errors.ts'

export interface ConnectedUser {
  readonly username: string
  readonly name: string
}

export type ConnectionStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'connected'; readonly url: string; readonly user: ConnectedUser }
  | { readonly kind: 'error'; readonly url: string | undefined; readonly code: ErrorCode }

// The token only goes in through `connect` and never comes out: the UI only receives the status
export interface GitLabConnection {
  status(): Promise<ConnectionStatus>
  connect(url: string, token: string): Promise<ConnectionStatus>
  disconnect(): Promise<ConnectionStatus>
}
