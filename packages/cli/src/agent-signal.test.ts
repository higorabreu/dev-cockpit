import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectTo } from '@dck/adapter-node-net'
import { createClient, createHub, ok, silentLogger } from '@dck/core'
import { connectLoopback, createFakeViews } from '@dck/core/testing'
import { startDaemon } from '@dck/daemon'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT, runCli } from './cli.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function bootDaemon() {
  const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-signal-')), 'daemon.sock')
  const started = await startDaemon({ endpoint, logger: silentLogger, views: createFakeViews() })
  if (!started.ok) throw new Error(started.error.message)
  cleanups.push(() => started.value.stop())
  return endpoint
}

async function subscriber(endpoint: string) {
  const connected = await connectTo(endpoint, silentLogger)
  if (!connected.ok) throw new Error(connected.error.message)
  const client = createClient(connected.value)
  cleanups.push(async () => client.close())
  const received: unknown[] = []
  await client.subscribe('agent', (data) => received.push(data))
  return received
}

async function signal(args: string[], endpoint: string, env: Record<string, string>) {
  const out: string[] = []
  const err: string[] = []
  const code = await runCli(['agent', 'signal', ...args], {
    endpoint,
    env,
    connect: (target) => connectTo(target, silentLogger),
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  return { code, printed: [...out, ...err] }
}

describe('dck agent signal', () => {
  it('should relay the state with the terminal id when it runs in a cockpit terminal', async () => {
    const endpoint = await bootDaemon()
    const received = await subscriber(endpoint)

    const result = await signal(['needs-you'], endpoint, { DCK_PTY_ID: '4' })

    expect(result).toEqual({ code: EXIT.ok, printed: [] })
    expect(received).toEqual([{ ptyId: 4, state: 'needs-you' }])
  })

  it('should exit successfully and print nothing when it runs outside a cockpit terminal', async () => {
    const endpoint = await bootDaemon()
    const received = await subscriber(endpoint)

    const result = await signal(['working'], endpoint, {})

    expect(result).toEqual({ code: EXIT.ok, printed: [] })
    expect(received).toEqual([])
  })

  it('should exit successfully and print nothing when the cockpit is closed', async () => {
    const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-signal-')), 'daemon.sock')

    const result = await signal(['your-turn'], endpoint, { DCK_PTY_ID: '1' })

    expect(result).toEqual({ code: EXIT.ok, printed: [] })
  })

  it('should exit successfully and send nothing when the state is unknown', async () => {
    const endpoint = await bootDaemon()
    const received = await subscriber(endpoint)

    const results = [
      await signal(['done'], endpoint, { DCK_PTY_ID: '1' }),
      await signal([], endpoint, { DCK_PTY_ID: '1' }),
      await signal(['working', 'extra'], endpoint, { DCK_PTY_ID: '1' }),
      await signal(['working'], endpoint, { DCK_PTY_ID: 'abc' }),
    ]

    expect(results.every((result) => result.code === EXIT.ok && result.printed.length === 0)).toBe(
      true,
    )
    expect(received).toEqual([])
  })

  it('should give up and exit successfully when the daemon never answers', async () => {
    const silent = createHub({ 'agent.signal': () => new Promise(() => {}) }, silentLogger)
    const started = Date.now()

    const code = await runCli(['agent', 'signal', 'working'], {
      endpoint: 'unused',
      env: { DCK_PTY_ID: '1' },
      connect: async () => ok(connectLoopback(silent)),
      out: () => {},
      err: () => {},
    })

    expect(code).toBe(EXIT.ok)
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('should print the usage when the agent subcommand is unknown', async () => {
    const err: string[] = []

    const code = await runCli(['agent'], {
      endpoint: 'unused',
      connect: async () => {
        throw new Error('unexpected connection')
      },
      out: () => {},
      err: (text) => err.push(text),
    })

    expect(code).toBe(EXIT.usage)
    expect(err.join('')).toContain('dck agent signal')
  })
})
