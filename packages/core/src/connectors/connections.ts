import type { Connection, ConnectionStatus, Connections } from '../ports/connections.ts'
import type { Logger } from '../ports/logger.ts'
import type { Connector } from './connector.ts'

export interface ConnectionsOptions {
  // The connectors enabled and implemented right now; read on every call, so disabling one applies at once
  connectors(): readonly Connector[]
  implementation(id: string): Connection | undefined
  readonly logger: Logger
}

const none: ConnectionStatus = { kind: 'none' }

// A disabled connector keeps its address and token, so enabling it again finds it still connected
export function createConnections(options: ConnectionsOptions): Connections {
  const { logger } = options
  const find = (id: string) =>
    options.connectors().some((connector) => connector.id === id)
      ? options.implementation(id)
      : undefined

  return {
    list: () => options.connectors(),

    status: async (id) => (await find(id)?.status()) ?? none,

    async connect(id, fields, token) {
      const connection = find(id)
      if (connection) return connection.connect(fields, token)
      logger.warn('connect refused for a connector that is not enabled', { id })
      return { kind: 'error', url: undefined, code: 'DCK-IPC-003' }
    },

    disconnect: async (id) => (await find(id)?.disconnect()) ?? none,
  }
}
