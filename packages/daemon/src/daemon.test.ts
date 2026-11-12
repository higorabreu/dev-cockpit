import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectTo } from '@dck/adapter-node-net'
import { createClient, DAEMON_PROTOCOL, silentLogger } from '@dck/core'
import { createFakeViews } from '@dck/core/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { type RunningDaemon, startDaemon } from './daemon.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function boot() {
  const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-daemon-')), 'daemon.sock')
  const started = await startDaemon({ endpoint, logger: silentLogger, views: createFakeViews() })
  if (!started.ok) throw new Error(started.error.message)
  const daemon: RunningDaemon = started.value
  cleanups.push(() => daemon.stop())
  const newClient = async () => {
    const connected = await connectTo(endpoint, silentLogger)
    if (!connected.ok) throw new Error(connected.error.message)
    const client = createClient(connected.value)
    cleanups.push(async () => client.close())
    return client
  }
  return { endpoint, newClient }
}

describe('startDaemon', () => {
  it('should answer ping when the daemon is running', async () => {
    const { newClient } = await boot()
    const client = await newClient()

    const result = await client.request('ping')

    expect(result).toEqual({ ok: true, value: 'pong' })
  })

  it('should report no delivery when a toggle is requested and no window is connected', async () => {
    const { newClient } = await boot()
    const client = await newClient()

    const result = await client.request('window.toggle')

    expect(result).toEqual({ ok: true, value: { delivered: 0 } })
  })

  it('should deliver a toggle event to the window when the window subscribed', async () => {
    const { newClient } = await boot()
    const window = await newClient()
    const received: unknown[] = []
    await window.subscribe('window', (data) => received.push(data))
    const cli = await newClient()

    const result = await cli.request('window.toggle')
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(result).toEqual({ ok: true, value: { delivered: 1 } })
    expect(received).toEqual([{ action: 'toggle' }])
  })

  it('should refuse to start when another daemon owns the endpoint', async () => {
    const { endpoint } = await boot()

    const second = await startDaemon({ endpoint, logger: silentLogger, views: createFakeViews() })

    expect(second.ok).toBe(false)
  })

  it('should deliver an agent report to a subscriber when the cli reports', async () => {
    const { newClient } = await boot()
    const window = await newClient()
    const received: unknown[] = []
    await window.subscribe('agent', (data) => received.push(data))
    const cli = await newClient()

    const result = await cli.request('agent.report', {
      agent: 'claude',
      ptyId: 3,
      payload: { a: 1 },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(result).toEqual({ ok: true, value: { delivered: 1 } })
    expect(received).toEqual([{ agent: 'claude', ptyId: 3, payload: { a: 1 } }])
  })

  it('should reject an agent report when the params are invalid', async () => {
    const { newClient } = await boot()
    const cli = await newClient()

    const result = await cli.request('agent.report', { agent: '', ptyId: -1 })

    expect(result.ok).toBe(false)
  })

  it('should reject an agent report when the payload is too large', async () => {
    const { newClient } = await boot()
    const cli = await newClient()

    const result = await cli.request('agent.report', {
      agent: 'claude',
      ptyId: 1,
      payload: { blob: 'x'.repeat(300 * 1024) },
    })

    expect(result.ok).toBe(false)
  })

  it('should report its protocol version when asked for info', async () => {
    const { newClient } = await boot()
    const client = await newClient()

    expect(await client.request('info')).toEqual({ ok: true, value: { protocol: DAEMON_PROTOCOL } })
  })

  it('should answer and then call the shutdown hook when asked to shut down', async () => {
    let stopped = 0
    const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-daemon-')), 'daemon.sock')
    const started = await startDaemon({
      views: createFakeViews(),
      endpoint,
      logger: silentLogger,
      onShutdown: () => {
        stopped += 1
      },
    })
    if (!started.ok) throw new Error(started.error.message)
    cleanups.push(() => started.value.stop())
    const connected = await connectTo(endpoint, silentLogger)
    if (!connected.ok) throw new Error(connected.error.message)
    const client = createClient(connected.value)
    cleanups.push(async () => client.close())

    const reply = await client.request('shutdown')
    await new Promise((resolve) => setTimeout(resolve, 120))

    expect(reply).toEqual({ ok: true, value: { stopping: true } })
    expect(stopped).toBe(1)
  })
})

describe('views methods', () => {
  it('should answer a snapshot for the view when it is asked', async () => {
    const { newClient } = await boot()
    const client = await newClient()
    await client.request('views.configure', { url: 'https://gl.test' })

    const result = await client.request('views.snapshot', { view: 'review' })

    expect(result).toMatchObject({ ok: true, value: { view: 'review', state: 'idle', items: [] } })
  })

  it('should publish the new state to the subscribers when a view is refreshed', async () => {
    const { newClient } = await boot()
    const window = await newClient()
    const states: string[] = []
    await window.subscribe('views', (data) => states.push((data as { state: string }).state))
    const other = await newClient()
    await other.request('views.configure', { url: 'https://gl.test' })

    await other.request('views.refresh', { view: 'mine' })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(states).toContain('refreshing')
    expect(states.at(-1)).toBe('idle')
  })

  it.each([
    ['an unknown view', { view: 'other' }],
    ['a negative age', { view: 'review', maxAgeMs: -1 }],
  ])('should refuse the request when it has %s', async (_label, params) => {
    const { newClient } = await boot()
    const client = await newClient()

    const result = await client.request('views.refresh', params)

    expect(result.ok).toBe(false)
  })
})
