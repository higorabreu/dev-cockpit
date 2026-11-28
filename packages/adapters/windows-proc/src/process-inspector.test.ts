import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { createProcessInspector, nodeScriptName, programName } from './process-inspector.ts'
import { createProcessScanner } from './process-scanner.ts'
import type { ProcessEntry, ProcessTable } from './process-table.ts'

interface FakeProcess extends ProcessEntry {
  readonly created: bigint
  readonly commandLine?: string
}

const fakeTable = (processes: readonly FakeProcess[]) => {
  const calls = { list: 0 }
  const byPid = (pid: number) => processes.find((process) => process.pid === pid)
  const table: ProcessTable = {
    list: async () => {
      calls.list += 1
      return processes.map(({ pid, parent, name }) => ({ pid, parent, name }))
    },
    createdAt: async (pid) => byPid(pid)?.created,
    commandLine: async (pid) => byPid(pid)?.commandLine,
  }
  return { table, calls }
}

const shell = { pid: 100, parent: 10, name: 'pwsh.exe', created: 1000n }
const host = { pid: 101, parent: 100, name: 'conhost.exe', created: 1001n }

const inspectorFor = (processes: readonly FakeProcess[], cwd = 'C:\\Users\\ana\\acme') =>
  createProcessInspector({
    cwdOf: (pid) => (pid === shell.pid ? cwd : undefined),
    table: fakeTable(processes).table,
    batchMs: 0,
  })

describe('createProcessInspector on Windows', () => {
  it('should report the shell itself when it is at the prompt', async () => {
    const inspector = inspectorFor([shell, host])

    const info = await inspector.inspect(shell.pid)

    expect(info).toEqual({
      cwd: 'C:\\Users\\ana\\acme',
      foreground: 'pwsh',
      foregroundPid: shell.pid,
      foregroundStart: '1000',
    })
  })

  it('should report the newest program the shell started when it runs one', async () => {
    const inspector = inspectorFor([
      shell,
      host,
      { pid: 120, parent: 100, name: 'git.exe', created: 1100n },
      { pid: 130, parent: 100, name: 'CLAUDE.EXE', created: 1200n },
      { pid: 140, parent: 130, name: 'rg.exe', created: 1300n },
    ])

    const info = await inspector.inspect(shell.pid)

    expect(info).toMatchObject({ foreground: 'claude', foregroundPid: 130 })
  })

  it("should look through Git's bash launcher and an npm shim when they start the program", async () => {
    const gitBash = { pid: 100, parent: 10, name: 'bash.exe', created: 1000n }
    const inspector = inspectorFor([
      gitBash,
      { pid: 110, parent: 100, name: 'bash.exe', created: 1010n },
      { pid: 120, parent: 110, name: 'cmd.exe', created: 1100n },
      { pid: 130, parent: 120, name: 'vim.exe', created: 1200n },
    ])

    const info = await inspector.inspect(gitBash.pid)

    expect(info).toMatchObject({ foreground: 'vim', foregroundPid: 130 })
  })

  it('should name a program by its npm package when node runs it from a generic script', async () => {
    const inspector = inspectorFor([
      shell,
      {
        pid: 130,
        parent: 100,
        name: 'node.exe',
        created: 1200n,
        commandLine:
          '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\ana\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"',
      },
    ])

    const info = await inspector.inspect(shell.pid)

    expect(info).toMatchObject({ foreground: 'claude-code', foregroundPid: 130 })
  })

  it('should skip a child older than the shell when its pid was reused from a dead parent', async () => {
    const inspector = inspectorFor([
      shell,
      { pid: 150, parent: 100, name: 'svchost.exe', created: 900n },
    ])

    const info = await inspector.inspect(shell.pid)

    expect(info?.foreground).toBe('pwsh')
  })

  it('should return undefined when the shell is gone or its directory is unknown', async () => {
    const gone = inspectorFor([host])
    const unknown = createProcessInspector({
      cwdOf: () => undefined,
      table: fakeTable([shell]).table,
      batchMs: 0,
    })

    expect(await gone.inspect(shell.pid)).toBeUndefined()
    expect(await unknown.inspect(shell.pid)).toBeUndefined()
  })

  it('should share one process list when several tabs are inspected at once', async () => {
    const other = { pid: 200, parent: 10, name: 'cmd.exe', created: 2000n }
    const { table, calls } = fakeTable([shell, other])
    const inspector = createProcessInspector({ cwdOf: () => 'C:\\', table, batchMs: 0 })

    const infos = await Promise.all([inspector.inspect(shell.pid), inspector.inspect(other.pid)])

    expect(infos.map((info) => info?.foreground)).toEqual(['pwsh', 'cmd'])
    expect(calls.list).toBe(1)
  })

  it('should return undefined when the process list cannot be read', async () => {
    const table: ProcessTable = {
      list: async () => {
        throw new Error('koffi failed to load')
      },
      createdAt: async () => undefined,
      commandLine: async () => undefined,
    }
    const inspector = createProcessInspector({ cwdOf: () => 'C:\\', table, batchMs: 0 })

    expect(await inspector.inspect(shell.pid)).toBeUndefined()
  })

  it.runIf(process.platform === 'win32')(
    'should find a program this process started when it reads the real process table',
    async () => {
      const child = spawn('ping', ['-n', '5', '127.0.0.1'], { windowsHide: true })
      try {
        await new Promise((resolve) => setTimeout(resolve, 300))
        const inspector = createProcessInspector({ cwdOf: () => process.cwd() })

        const info = await inspector.inspect(process.pid)

        expect(info).toMatchObject({ foreground: 'ping', foregroundPid: child.pid })
      } finally {
        child.kill()
      }
    },
  )
})

describe('nodeScriptName', () => {
  it.each([
    { script: 'node C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js', expected: 'codex' },
    { script: 'node "C:\\my tools\\node_modules\\eslint\\bin\\index.mjs"', expected: 'eslint' },
    { script: 'node C:\\Users\\ana\\server.js --port 3000', expected: 'server' },
    { script: 'node --inspect', expected: undefined },
  ])('should name it $expected when node runs $script', ({ script, expected }) => {
    expect(nodeScriptName(script)).toBe(expected)
  })
})

describe('programName', () => {
  it('should drop the extension and the case when Windows records the file name', () => {
    expect(programName('PING.EXE')).toBe('ping')
  })
})

describe('createProcessScanner on Windows', () => {
  it('should find no old daemon when asked, since none predates shutdown on Windows', async () => {
    const found = await createProcessScanner().find({ argument: 'daemon.cjs', endpoint: undefined })

    expect(found).toEqual([])
  })
})
