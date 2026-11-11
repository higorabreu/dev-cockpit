import { describe, expect, it } from 'vitest'
import { DckError } from '../errors.ts'
import type { Logger } from '../ports/logger.ts'
import { connectLoopback } from '../testing/loopback.ts'
import { createClient } from './client.ts'
import { createHub } from './hub.ts'

function recordingLogger() {
  const errors: string[] = []
  const logger: Logger = {
    info() {},
    warn() {},
    error: (message) => {
      errors.push(message)
    },
  }
  return { logger, errors }
}

function setup(handlers: Parameters<typeof createHub>[0] = {}) {
  const { logger, errors } = recordingLogger()
  const hub = createHub(handlers, logger)
  const client = createClient(connectLoopback(hub))
  return { hub, client, errors }
}

describe('hub requests', () => {
  it('should return the handler result when the method exists', async () => {
    const { client } = setup({ ping: () => 'pong' })

    const result = await client.request('ping')

    expect(result).toEqual({ ok: true, value: 'pong' })
  })

  it('should return null when the handler returns nothing', async () => {
    const { client } = setup({ nothing: () => undefined })

    const result = await client.request('nothing')

    expect(result).toEqual({ ok: true, value: null })
  })

  it('should return an unknown method error when no handler exists', async () => {
    const { client } = setup()

    const result = await client.request('nao.existe')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.data?.code).toBe('DCK-IPC-001')
  })

  it('should forward the error code when a handler throws a DckError', async () => {
    const { client } = setup({
      falha: () => {
        throw new DckError('DCK-IPC-003', 'campo x')
      },
    })

    const result = await client.request('falha')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.data?.code).toBe('DCK-IPC-003')
  })

  it('should hide the internal details when a handler throws an unexpected error', async () => {
    const { client, errors } = setup({
      quebra: () => {
        throw new Error('senha=segredo no stack')
      },
    })

    const result = await client.request('quebra')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.data?.code).toBe('DCK-IPC-002')
      expect(result.error.message).not.toContain('segredo')
    }
    expect(errors).toEqual(['ipc handler failed'])
  })

  it('should answer concurrent requests with their own results when they overlap', async () => {
    const { client } = setup({
      lento: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return 'lento'
      },
      rapido: () => 'rapido',
    })

    const [slow, fast] = await Promise.all([client.request('lento'), client.request('rapido')])

    expect(slow).toEqual({ ok: true, value: 'lento' })
    expect(fast).toEqual({ ok: true, value: 'rapido' })
  })
})

describe('hub subscriptions', () => {
  it('should deliver published data to the subscriber when a topic is published', async () => {
    const { hub, client } = setup()
    const received: unknown[] = []
    await client.subscribe('window', (data) => received.push(data))

    const delivered = hub.publish('window', { action: 'toggle' })
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(delivered).toBe(1)
    expect(received).toEqual([{ action: 'toggle' }])
  })

  it('should report zero deliveries when nobody subscribed to the topic', () => {
    const { hub } = setup()

    const delivered = hub.publish('window', { action: 'toggle' })

    expect(delivered).toBe(0)
  })

  it('should stop delivering when the subscriber disconnects', async () => {
    const { hub, client } = setup()
    await client.subscribe('window', () => {})

    client.close()

    expect(hub.publish('window')).toBe(0)
  })

  it('should reject the subscription when the topic is missing', async () => {
    const { client } = setup()

    const result = await client.request('subscribe', {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.data?.code).toBe('DCK-IPC-003')
  })
})
