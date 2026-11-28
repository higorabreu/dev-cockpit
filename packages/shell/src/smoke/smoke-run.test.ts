import { homedir } from 'node:os'
import { createNodePtyHost } from '@dck/adapter-node-pty'
import { errorBody, fail, ok, type SecretStore, silentLogger } from '@dck/core'
import { FakePtyHost } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { runSmoke, type SmokeDeps } from './smoke-run.ts'

const secrets = (works: boolean): SecretStore => ({
  get: async () => (works ? ok(undefined) : fail(errorBody('DCK-SEC-001', 'binding missing'))),
  set: async () => ok(undefined),
  delete: async () => ok(undefined),
})

const deps = (overrides: Partial<SmokeDeps> = {}): SmokeDeps => ({
  platform: 'linux',
  ptyHost: new FakePtyHost(),
  secrets: secrets(true),
  processes: { inspect: async () => ({ cwd: '/home/ana', foreground: 'sh' }) },
  home: '/home/ana',
  logger: silentLogger,
  timeoutMs: 50,
  ...overrides,
})

describe('runSmoke', () => {
  it('should pass and close the terminal when the terminal, the inspector and the secret store work', async () => {
    // Arrange
    const ptyHost = new FakePtyHost()
    const started: string[] = []

    // Act
    const run = runSmoke(
      deps({ ptyHost, started: (pid, cwd) => void started.push(`${pid} ${cwd}`) }),
    )
    ptyHost.sessions[0]?.emitData('dck-smoke')
    ptyHost.sessions[0]?.emitData('-ok\r\n')

    // Assert
    expect(await run).toBe(true)
    expect(ptyHost.sessions[0]?.killed).toBe(true)
    expect(started).toEqual(['1 /home/ana'])
  })

  it('should fail when the terminal never prints the marker', async () => {
    expect(await runSmoke(deps())).toBe(false)
  })

  it.each([
    {
      what: 'the inspector finds nothing',
      overrides: { processes: { inspect: async () => undefined } },
    },
    { what: 'the secret store binding is missing', overrides: { secrets: secrets(false) } },
  ])('should fail when $what', async ({ overrides }) => {
    // Arrange
    const ptyHost = new FakePtyHost()

    // Act
    const run = runSmoke(deps({ ...overrides, ptyHost }))
    ptyHost.sessions[0]?.emitData('dck-smoke-ok')

    // Assert
    expect(await run).toBe(false)
  })

  it('should see the marker from the real shell when node-pty runs it on this system', async () => {
    const passed = await runSmoke(
      deps({
        platform: process.platform,
        ptyHost: createNodePtyHost(),
        home: homedir(),
        timeoutMs: 10_000,
      }),
    )

    expect(passed).toBe(true)
  })
})
