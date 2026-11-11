import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectTo } from '@dck/adapter-node-net'
import { createClient, silentLogger } from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { type RunningDaemon, startDaemon } from './daemon.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function boot() {
  const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-daemon-')), 'daemon.sock')
  const started = await startDaemon({ endpoint, logger: silentLogger })
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

    const second = await startDaemon({ endpoint, logger: silentLogger })

    expect(second.ok).toBe(false)
  })
})
