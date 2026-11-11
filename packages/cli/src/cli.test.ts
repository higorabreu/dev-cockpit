import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectTo } from '@dck/adapter-node-net'
import { createClient, silentLogger } from '@dck/core'
import { startDaemon } from '@dck/daemon'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT, runCli } from './cli.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function run(argv: string[], endpoint: string) {
  const out: string[] = []
  const err: string[] = []
  const code = runCli(argv, {
    endpoint,
    connect: (target) => connectTo(target, silentLogger),
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  })
  return { code, out, err }
}

async function bootDaemon() {
  const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-cli-')), 'daemon.sock')
  const started = await startDaemon({ endpoint, logger: silentLogger })
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

describe('runCli', () => {
  it('should exit successfully when a window is connected and toggle is requested', async () => {
    const endpoint = await bootDaemon()
    await connectWindow(endpoint)

    const result = run(['toggle'], endpoint)

    expect(await result.code).toBe(EXIT.ok)
    expect(result.err).toEqual([])
  })

  it('should tell the user no window is connected when toggle finds no subscriber', async () => {
    const endpoint = await bootDaemon()

    const result = run(['toggle'], endpoint)

    expect(await result.code).toBe(EXIT.noWindow)
    expect(result.err.join('')).toContain('Nenhuma janela')
  })

  it('should explain how to start the daemon when it is not running', async () => {
    const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-cli-')), 'daemon.sock')

    const result = run(['toggle'], endpoint)

    expect(await result.code).toBe(EXIT.failed)
    expect(result.err.join('')).toContain('dck daemon')
  })

  it('should print pong when the daemon answers ping', async () => {
    const endpoint = await bootDaemon()

    const result = run(['ping'], endpoint)

    expect(await result.code).toBe(EXIT.ok)
    expect(result.out.join('')).toBe('pong\n')
  })

  it('should print the usage and fail when the command is unknown', async () => {
    const result = run(['voar'], '/nao/importa')

    expect(await result.code).toBe(EXIT.usage)
    expect(result.err.join('')).toContain('Uso: dck')
  })
})
