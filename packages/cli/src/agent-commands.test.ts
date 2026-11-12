import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectTo } from '@dck/adapter-node-net'
import { createClient, createTranslator, silentLogger } from '@dck/core'
import { createFakeViews } from '@dck/core/testing'
import { startDaemon } from '@dck/daemon'
import { afterEach, describe, expect, it } from 'vitest'
import { type AgentDeps, runAgentCommand } from './agent-commands.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function bootDaemon() {
  const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-agent-')), 'daemon.sock')
  const started = await startDaemon({ endpoint, logger: silentLogger, views: createFakeViews() })
  if (!started.ok) throw new Error(started.error.message)
  cleanups.push(() => started.value.stop())
  return endpoint
}

function setup(options: {
  endpoint: string
  stdin?: string
  env?: Record<string, string>
  settings?: string
  answer?: boolean
}) {
  const out: string[] = []
  const err: string[] = []
  const files = new Map<string, string>()
  if (options.settings !== undefined) files.set('/home/u/.claude/settings.json', options.settings)
  const forwarded: Array<{ command: string; input: string }> = []
  const logged: string[] = []
  const deps: AgentDeps = {
    env: options.env ?? {},
    t: createTranslator('pt-BR').t,
    readStdin: async () => options.stdin ?? '',
    forward: async (command, input) => {
      forwarded.push({ command, input })
      return 'LINHA DO USUARIO\n'
    },
    settingsPath: '/home/u/.claude/settings.json',
    home: '/home/u',
    log: (line) => void logged.push(line),
    readSettings: async (path) => files.get(path),
    writeSettings: async (path, text) => void files.set(path, text),
    backup: async (path) => {
      files.set(`${path}.dck-backup`, files.get(path) ?? '')
      return `${path}.dck-backup`
    },
    confirm: async () => options.answer ?? false,
    commandParts: { node: '/n/node', script: '/s/main.ts' },
  }
  const io = {
    endpoint: options.endpoint,
    connect: (target: string) => connectTo(target, silentLogger),
    out: (text: string) => void out.push(text),
    err: (text: string) => void err.push(text),
  }
  return {
    run: (args: string[]) => runAgentCommand(args, io, deps),
    out,
    err,
    files,
    forwarded,
    logged,
  }
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

const payload = JSON.stringify({ model: { id: 'm' } })

describe('dck agent report', () => {
  it('should send the payload with the terminal id to the daemon when run inside a cockpit terminal', async () => {
    const endpoint = await bootDaemon()
    const received = await subscriber(endpoint)
    const { run } = setup({ endpoint, stdin: payload, env: { DCK_PTY_ID: '4' } })

    const code = await run(['report', '--agent', 'claude'])
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(code).toBe(0)
    expect(received).toEqual([{ agent: 'claude', ptyId: 4, payload: { model: { id: 'm' } } }])
  })

  it('should send nothing and still succeed when it is not run inside a cockpit terminal', async () => {
    const endpoint = await bootDaemon()
    const received = await subscriber(endpoint)
    const { run } = setup({ endpoint, stdin: payload, env: {} })

    const code = await run(['report', '--agent', 'claude'])
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(code).toBe(0)
    expect(received).toEqual([])
  })

  it('should succeed quietly when the daemon is not running', async () => {
    const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-none-')), 'daemon.sock')
    const { run, err } = setup({ endpoint, stdin: payload, env: { DCK_PTY_ID: '1' } })

    expect(await run(['report', '--agent', 'claude'])).toBe(0)
    expect(err).toEqual([])
  })

  it('should print what the forwarded command prints and give it the same input when chaining', async () => {
    const endpoint = join(mkdtempSync(join(tmpdir(), 'dck-none-')), 'daemon.sock')
    const { run, out, forwarded } = setup({ endpoint, stdin: payload, env: {} })

    await run(['report', '--agent', 'claude', '--forward', '~/bar.sh'])

    expect(out.join('')).toBe('LINHA DO USUARIO\n')
    expect(forwarded).toEqual([{ command: '~/bar.sh', input: payload }])
  })

  it('should warn on stderr and still succeed when the input is not json', async () => {
    const endpoint = await bootDaemon()
    const { run, err } = setup({ endpoint, stdin: 'oops', env: { DCK_PTY_ID: '1' } })

    expect(await run(['report', '--agent', 'claude'])).toBe(0)
    expect(err.join('')).toContain('JSON')
  })
})

describe('dck agent report failures', () => {
  it('should write the reason to the log and stay quiet on screen when the daemon rejects the report', async () => {
    const endpoint = await bootDaemon()
    const { run, err, logged } = setup({ endpoint, stdin: '{"a":1}', env: { DCK_PTY_ID: '-5' } })

    const code = await run(['report', '--agent', 'claude'])

    expect(code).toBe(0)
    expect(err).toEqual([])
    expect(logged).toHaveLength(1)
    expect(logged[0]).toContain('rejected')
  })
})

describe('dck agent install', () => {
  const settings = JSON.stringify({ model: 'opus', hooks: {} })

  it('should show the change and write nothing when the user does not confirm', async () => {
    const { run, out, files } = setup({ endpoint: '/x', settings, answer: false })

    await run(['install'])

    expect(out.join('')).toContain('Depois')
    expect(out.join('')).toContain('~/.claude/settings.json')
    expect(out.join('')).not.toContain('/n/node')
    expect(files.get('/home/u/.claude/settings.json')).toBe(settings)
  })

  it('should back up and write the status line when the user confirms', async () => {
    const { run, files } = setup({ endpoint: '/x', settings, answer: true })

    await run(['install'])

    expect(files.get('/home/u/.claude/settings.json.dck-backup')).toBe(settings)
    const written = JSON.parse(files.get('/home/u/.claude/settings.json') ?? '{}')
    expect(written.model).toBe('opus')
    expect(written.statusLine.command).toContain('agent report --agent claude')
  })

  it('should skip the question when yes is passed', async () => {
    const { run, files } = setup({ endpoint: '/x', settings, answer: false })

    await run(['install', '--yes'])

    expect(JSON.parse(files.get('/home/u/.claude/settings.json') ?? '{}').statusLine).toBeDefined()
  })

  it('should leave an invalid settings file alone when the json cannot be read', async () => {
    const { run, files, err } = setup({ endpoint: '/x', settings: '{ nope', answer: true })

    const code = await run(['install', '--yes'])

    expect(code).toBe(1)
    expect(files.get('/home/u/.claude/settings.json')).toBe('{ nope')
    expect(err.join('')).toContain('inválido')
  })

  it('should say it is already installed when running it twice', async () => {
    const { run, out } = setup({ endpoint: '/x', settings, answer: true })
    await run(['install', '--yes'])

    await run(['install', '--yes'])

    expect(out.join('')).toContain('Já está instalado')
  })
})

describe('dck agent uninstall', () => {
  it('should restore the original status line when it was chained', async () => {
    const original = JSON.stringify({ statusLine: { type: 'command', command: '~/bar.sh' } })
    const { run, files } = setup({ endpoint: '/x', settings: original })
    await run(['install', '--yes'])

    await run(['uninstall', '--yes'])

    expect(JSON.parse(files.get('/home/u/.claude/settings.json') ?? '{}')).toEqual({
      statusLine: { type: 'command', command: '~/bar.sh' },
    })
  })

  it('should say it is not installed when nothing of ours is there', async () => {
    const { run, out } = setup({ endpoint: '/x', settings: '{}' })

    await run(['uninstall', '--yes'])

    expect(out.join('')).toContain('Não está instalado')
  })
})

describe('dck agent usage', () => {
  it('should print the usage and exit with the usage code when the subcommand is unknown', async () => {
    const { run, err } = setup({ endpoint: '/x' })

    expect(await run(['wat'])).toBe(64)
    expect(err.join('')).toContain('Uso')
  })
})

describe('dck agent install output', () => {
  it('should explain what happens next and how to undo it when the install is done', async () => {
    const { run, out } = setup({ endpoint: '/x', settings: '{}', answer: true })

    await run(['install'])

    const text = out.join('')
    expect(text).toContain('✓ Configurado.')
    expect(text).toContain('Cópia do arquivo anterior: ~/.claude/settings.json.dck-backup')
    expect(text).toContain('dck agent uninstall')
  })

  it('should show a short name for our command and mention the chained one when chaining', async () => {
    const original = JSON.stringify({ statusLine: { type: 'command', command: '~/bar.sh' } })
    const { run, out } = setup({ endpoint: '/x', settings: original, answer: true })

    await run(['install'])

    expect(out.join('')).toContain('dck agent report, encadeado com ~/bar.sh')
    expect(out.join('')).toContain('continua funcionando')
  })
})
