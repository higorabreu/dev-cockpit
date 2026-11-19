import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectTo } from '@dck/adapter-node-net'
import { createClient, createTranslator, silentLogger } from '@dck/core'
import { createFakeViews } from '@dck/core/testing'
import { startDaemon } from '@dck/daemon'
import { afterEach, describe, expect, it } from 'vitest'
import { type DaemonCommand, isDaemonCommand, runDaemonCommand } from './daemon-command.ts'
import { EXIT } from './exit-codes.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function run(command: DaemonCommand, endpoint: string) {
  const out: string[] = []
  const err: string[] = []
  let translations = 0
  const code = await runDaemonCommand(command, {
    endpoint,
    connect: (target) => connectTo(target, silentLogger),
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    translate: async () => {
      translations++
      return createTranslator('en').t
    },
  })
  return { code, out, err, translations }
}

async function bootDaemon() {
  const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-daemon-command-')), 'daemon.sock')
  const started = await startDaemon({
    endpoint,
    logger: silentLogger,
    views: new Map([['gitlab', createFakeViews()]]),
  })
  if (!started.ok) throw new Error(started.error.message)
  cleanups.push(() => started.value.stop())
  return endpoint
}

async function connectWindow(endpoint: string) {
  const connected = await connectTo(endpoint, silentLogger)
  if (!connected.ok) throw new Error(connected.error.message)
  const client = createClient(connected.value)
  cleanups.push(async () => client.close())
  await client.subscribe('window', () => {})
}

describe('runDaemonCommand', () => {
  it('should not load the text when toggle reaches a window', async () => {
    // Arrange
    const endpoint = await bootDaemon()
    await connectWindow(endpoint)

    // Act
    const result = await run('toggle', endpoint)

    // Assert
    expect(result).toEqual({ code: EXIT.ok, out: [], err: [], translations: 0 })
  })

  it('should not load the text when ping gets its answer', async () => {
    const endpoint = await bootDaemon()

    const result = await run('ping', endpoint)

    expect(result).toEqual({ code: EXIT.ok, out: ['pong\n'], err: [], translations: 0 })
  })

  it('should load the text to explain the failure when no daemon answers', async () => {
    const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-daemon-command-')), 'daemon.sock')

    const result = await run('toggle', endpoint)

    expect(result.code).toBe(EXIT.unavailable)
    expect(result.err.join('')).toBe(
      'Could not talk to the daemon\nStart the daemon with: dck daemon\n',
    )
    expect(result.translations).toBe(1)
  })

  it('should load the text to say so when toggle finds no window', async () => {
    const endpoint = await bootDaemon()

    const result = await run('toggle', endpoint)

    expect(result.code).toBe(EXIT.unavailable)
    expect(result.err.join('')).toContain('No window is connected')
    expect(result.translations).toBe(1)
  })
})

describe('isDaemonCommand', () => {
  it('should accept only toggle and ping when checking a command', () => {
    expect(['toggle', 'ping', 'daemon', 'ext', undefined].map(isDaemonCommand)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
  })
})
