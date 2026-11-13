import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectTo } from '@dck/adapter-node-net'
import { createClient, createTranslator, silentLogger } from '@dck/core'
import { createFakeViews } from '@dck/core/testing'
import { startDaemon } from '@dck/daemon'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT, exitCodeFor, runCli } from './cli.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function run(argv: string[], endpoint: string, locale: 'pt-BR' | 'en' = 'pt-BR') {
  const out: string[] = []
  const err: string[] = []
  const code = runCli(argv, {
    endpoint,
    t: createTranslator(locale).t,
    connect: (target) => connectTo(target, silentLogger),
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  })
  return { code, out, err }
}

async function bootDaemon() {
  const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-cli-')), 'daemon.sock')
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

    expect(await result.code).toBe(EXIT.unavailable)
    expect(result.err.join('')).toContain('Nenhuma janela')
  })

  it('should explain how to start the daemon when it is not running', async () => {
    const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-cli-')), 'daemon.sock')

    const result = run(['toggle'], endpoint)

    expect(await result.code).toBe(EXIT.unavailable)
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

describe('exitCodeFor', () => {
  const error = (category: string) => ({
    code: -32000,
    message: 'x',
    data: { code: 'DCK-X-001', category },
  })

  it('should map the error category to the sysexits code when choosing the exit code', () => {
    expect(exitCodeFor(error('invalid_argument'))).toBe(EXIT.usage)
    expect(exitCodeFor(error('unavailable'))).toBe(EXIT.unavailable)
    expect(exitCodeFor(error('internal'))).toBe(EXIT.software)
  })

  it('should use the general failure code when the category has no specific mapping', () => {
    expect(exitCodeFor(error('not_found'))).toBe(EXIT.failed)
    expect(exitCodeFor({ code: -32000, message: 'x' })).toBe(EXIT.failed)
  })

  it('should print the usage in english when the translator is english', async () => {
    const result = run([], '/x', 'en')

    await result.code

    expect(result.err.join('')).toContain('Usage: dck')
  })

  it('should say no window is connected in english when the translator is english', async () => {
    const endpoint = await bootDaemon()

    const result = run(['toggle'], endpoint, 'en')

    expect(await result.code).toBe(EXIT.unavailable)
    expect(result.err.join('')).toContain('No window is connected')
  })
})
