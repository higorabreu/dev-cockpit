import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectTo } from '@dck/adapter-node-net'
import { createClient, silentLogger } from '@dck/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildCli } from './cli-bundle.mjs'

let resources = ''
// dck.mjs alone, without the cli/ folder: what runs here loads nothing else
let entryOnly = ''

beforeAll(async () => {
  resources = mkdtempSync(join(tmpdir(), 'dck-cli-bundle-'))
  await buildCli(join(resources, 'dck.mjs'))
  entryOnly = join(resources, 'entry-only')
  mkdirSync(entryOnly)
  copyFileSync(join(resources, 'dck.mjs'), join(entryOnly, 'dck.mjs'))
}, 30_000)

afterAll(() => rmSync(resources, { recursive: true, force: true }))

const environment = (extra: Record<string, string> = {}) => ({
  PATH: process.env.PATH,
  LANG: 'en_US.UTF-8',
  DCK_ENDPOINT: join(resources, 'run', 'daemon.sock'),
  DCK_CONFIG_DIR: join(resources, 'config'),
  DCK_STATE_DIR: join(resources, 'state'),
  ...extra,
})

const dck = (args: readonly string[], extra: Record<string, string> = {}, folder = resources) =>
  spawnSync(process.execPath, [join(folder, 'dck.mjs'), ...args], {
    env: environment(extra),
    encoding: 'utf8',
    timeout: 10_000,
  })

// Async, so the daemon's subscribers in this process keep receiving while the command runs
const dckAsync = (args: readonly string[], extra: Record<string, string> = {}) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [join(entryOnly, 'dck.mjs'), ...args], {
      env: environment(extra),
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })

async function startDaemon(): Promise<ChildProcess> {
  mkdirSync(join(resources, 'run'), { mode: 0o700 })
  const daemon = spawn(process.execPath, [join(resources, 'dck.mjs'), 'daemon'], {
    env: environment(),
    stdio: 'ignore',
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    const connected = await connectTo(environment().DCK_ENDPOINT, silentLogger)
    if (connected.ok) {
      connected.value.close()
      return daemon
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  daemon.kill()
  throw new Error('the bundled daemon did not start')
}

describe('buildCli', () => {
  it('should keep zod classic, the settings and the catalogs out of the entry when bundling the CLI', () => {
    // Arrange
    const entry = readFileSync(join(resources, 'dck.mjs'), 'utf8')

    // Act
    const loaded = ['zod/v4/classic/', 'i18n/pt-BR.ts', 'settings/settings.ts', 'adapters/jsonc/']

    // Assert
    expect(loaded.filter((path) => entry.includes(path))).toEqual([])
    expect(entry).toContain('cli/src/agent-signal.ts')
    expect(readdirSync(join(resources, 'cli'))).toEqual(
      expect.arrayContaining(['daemon-process.mjs', 'full-cli.mjs']),
    )
  })

  it('should load the rest from cli/ when a command needs it', () => {
    const run = dck(['--help'])

    expect(run.status).toBe(0)
    expect(run.stderr).toContain('Usage: dck <command>')
  })

  it('should explain the failure when toggle finds no daemon', () => {
    const run = dck(['toggle'])

    expect(run.status).toBe(69)
    expect(run.stderr).toBe('Could not talk to the daemon\nStart the daemon with: dck daemon\n')
  })

  it('should signal an agent in silence with the entry alone when no daemon runs', () => {
    const run = dck(['agent', 'signal', 'working'], { DCK_PTY_ID: '2' }, entryOnly)

    expect({ status: run.status, stdout: run.stdout, stderr: run.stderr }).toEqual({
      status: 0,
      stdout: '',
      stderr: '',
    })
  })

  it('should toggle, ping and signal an agent with the entry alone when the daemon answers', async () => {
    // Arrange
    const daemon = await startDaemon()
    const connected = await connectTo(environment().DCK_ENDPOINT, silentLogger)
    if (!connected.ok) throw new Error(connected.error.message)
    const window = createClient(connected.value)
    const received: unknown[] = []
    await window.subscribe('window', (data) => received.push(data))
    await window.subscribe('agent', (data) => received.push(data))

    try {
      // Act
      const toggle = await dckAsync(['toggle'])
      const ping = await dckAsync(['ping'])
      const signal = await dckAsync(['agent', 'signal', 'needs-you'], { DCK_PTY_ID: '4' })

      // Assert
      expect([toggle, ping, signal]).toEqual([
        { status: 0, stdout: '', stderr: '' },
        { status: 0, stdout: 'pong\n', stderr: '' },
        { status: 0, stdout: '', stderr: '' },
      ])
      expect(received).toEqual([{ action: 'toggle' }, { ptyId: 4, state: 'needs-you' }])
    } finally {
      window.close()
      daemon.kill('SIGTERM')
    }
  }, 20_000)
})
