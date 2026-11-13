import { describe, expect, it } from 'vitest'
import type { Connection, ConnectionFields } from '../ports/connections.ts'
import { silentLogger } from '../ports/logger.ts'
import { createConnections } from './connections.ts'
import type { Connector } from './connector.ts'
import { GITLAB_CONNECTOR } from './gitlab.ts'

function setup() {
  let enabled: readonly Connector[] = [GITLAB_CONNECTOR]
  const connects: { fields: ConnectionFields; token: string }[] = []
  let disconnects = 0
  const gitlab: Connection = {
    status: async () => ({
      kind: 'connected',
      url: 'https://gl.test',
      user: { username: 'ana', name: 'Ana' },
    }),
    connect: async (fields, token) => {
      connects.push({ fields, token })
      return { kind: 'none' }
    },
    disconnect: async () => {
      disconnects += 1
      return { kind: 'none' }
    },
  }
  const connections = createConnections({
    connectors: () => enabled,
    implementation: (id) => (id === 'gitlab' ? gitlab : undefined),
    logger: silentLogger,
  })
  const enable = (on: boolean) => {
    enabled = on ? [GITLAB_CONNECTOR] : []
  }
  return { connections, connects, disconnects: () => disconnects, enable }
}

describe('createConnections', () => {
  it('should answer for the connector by its id when it is enabled', async () => {
    const { connections } = setup()

    const status = await connections.status('gitlab')

    expect(status.kind).toBe('connected')
    expect(connections.list()).toEqual([GITLAB_CONNECTOR])
  })

  it('should pass the fields and the token to the connector when connecting', async () => {
    const { connections, connects } = setup()

    await connections.connect('gitlab', { url: 'https://gl.test' }, 'glpat-x')

    expect(connects).toEqual([{ fields: { url: 'https://gl.test' }, token: 'glpat-x' }])
  })

  it('should report none, refuse to connect and keep the account when the connector is disabled', async () => {
    const { connections, connects, disconnects, enable } = setup()
    enable(false)

    const status = await connections.status('gitlab')
    const connected = await connections.connect('gitlab', { url: 'https://gl.test' }, 'glpat-x')
    await connections.disconnect('gitlab')

    expect(status).toEqual({ kind: 'none' })
    expect(connected).toEqual({ kind: 'error', url: undefined, code: 'DCK-IPC-003' })
    expect(connects).toEqual([])
    expect(disconnects()).toBe(0)
    expect(connections.list()).toEqual([])
  })

  it('should find the account still connected when the connector is enabled again', async () => {
    const { connections, enable } = setup()
    enable(false)

    enable(true)

    expect((await connections.status('gitlab')).kind).toBe('connected')
  })

  it('should refuse an id no connector has', async () => {
    const { connections } = setup()

    const status = await connections.connect('acme', { url: 'https://a.test' }, 'x')

    expect(status).toEqual({ kind: 'error', url: undefined, code: 'DCK-IPC-003' })
  })
})
