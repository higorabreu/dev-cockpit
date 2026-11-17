import type { LogContext, Logger } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { readShellPath, type ShellRun } from '../platform/shell-path.ts'
import { createTabPath, mergePaths } from './tab-path.ts'

function recorder() {
  const infos: { message: string; context: LogContext | undefined }[] = []
  const warnings: { message: string; context: LogContext | undefined }[] = []
  const logger: Logger = {
    info: (message, context) => void infos.push({ message, context }),
    warn: (message, context) => void warnings.push({ message, context }),
    error() {},
  }
  return { infos, warnings, logger }
}

// The tabs' shell as a fake executor: what it prints, or how it ends
function tabShell(
  answer: ShellRun,
  inherited = '/usr/bin:/bin',
  platform: NodeJS.Platform = 'linux',
) {
  const { infos, warnings, logger } = recorder()
  const runs: { file: string; args: readonly string[]; timeoutMs: number }[] = []
  let clock = 1000
  const tabPath = createTabPath({
    platform,
    inherited: () => inherited,
    read: () =>
      readShellPath({
        shell: '/bin/bash',
        flags: ['-i'],
        logger,
        timeoutMs: 3000,
        run: async (file, args, timeoutMs) => {
          runs.push({ file, args, timeoutMs })
          clock += 180
          return answer
        },
      }),
    logger,
    now: () => clock,
  })
  return { tabPath, runs, infos, warnings }
}

const printed = (output: string): ShellRun => ({ kind: 'output', output })

describe('createTabPath', () => {
  it('should add the folders the shell startup files add when the marks come with noise around them', async () => {
    // Arrange
    const { tabPath, runs } = tabShell(
      printed(
        'Welcome to acme-dev\nbash: no job control in this shell\n' +
          '__DCK_PATH__/home/ana/.nvm/versions/node/v24.1.0/bin:/usr/bin:/home/ana/.local/bin__DCK_PATH__' +
          '\nhave a nice day\n',
      ),
    )

    // Act
    const path = await tabPath.path()

    // Assert
    expect(path).toBe('/usr/bin:/bin:/home/ana/.nvm/versions/node/v24.1.0/bin:/home/ana/.local/bin')
    expect(runs).toEqual([
      {
        file: '/bin/bash',
        args: ['-i', '-c', `printf '__DCK_PATH__%s__DCK_PATH__' "$PATH"`],
        timeoutMs: 3000,
      },
    ])
  })

  it('should run the shell once and keep its answer when several checks ask for the PATH', async () => {
    // Arrange
    const { tabPath, runs, infos } = tabShell(printed('__DCK_PATH__/opt/acme/bin__DCK_PATH__'))

    // Act
    const answers = await Promise.all([tabPath.path(), tabPath.path()])
    const later = await tabPath.path()

    // Assert
    expect(runs).toHaveLength(1)
    expect([...answers, later]).toEqual([
      '/usr/bin:/bin:/opt/acme/bin',
      '/usr/bin:/bin:/opt/acme/bin',
      '/usr/bin:/bin:/opt/acme/bin',
    ])
    expect(infos).toEqual([
      { message: 'tab shell PATH read', context: { ms: 180, read: true, added: 1 } },
    ])
  })

  it('should keep the inherited PATH and warn once with the reason when the shell times out', async () => {
    // Arrange
    const { tabPath, warnings, runs } = tabShell({
      kind: 'failed',
      code: null,
      signal: 'SIGKILL',
      timedOut: true,
    })

    // Act
    const first = await tabPath.path()
    const second = await tabPath.path()

    // Assert
    expect([first, second]).toEqual(['/usr/bin:/bin', '/usr/bin:/bin'])
    expect(runs).toHaveLength(1)
    expect(warnings).toEqual([
      {
        message: 'shell PATH not read, keeping the inherited one',
        context: { shell: '/bin/bash', code: null, signal: 'SIGKILL', timedOut: true },
      },
    ])
  })

  it('should keep the inherited PATH and warn with the exit code when the shell exits non-zero', async () => {
    // Arrange
    const { tabPath, warnings } = tabShell({
      kind: 'failed',
      code: 2,
      signal: null,
      timedOut: false,
    })

    // Act
    const path = await tabPath.path()

    // Assert
    expect(path).toBe('/usr/bin:/bin')
    expect(warnings.map((warning) => warning.context)).toEqual([
      { shell: '/bin/bash', code: 2, signal: null, timedOut: false },
    ])
  })

  it('should keep the inherited PATH when the shell prints no marks', async () => {
    // Arrange
    const { tabPath, warnings } = tabShell(printed('command not found: printf\n'))

    // Act
    const path = await tabPath.path()

    // Assert
    expect(path).toBe('/usr/bin:/bin')
    expect(warnings.map((warning) => warning.message)).toEqual([
      'shell PATH has no valid entry, keeping the inherited one',
    ])
  })

  it('should run no shell and keep the process PATH when on Windows', async () => {
    // Arrange
    const { tabPath, runs } = tabShell(
      printed('__DCK_PATH__/opt/acme/bin__DCK_PATH__'),
      'C:\\Windows;C:\\Users\\ana\\AppData\\Roaming\\npm',
      'win32',
    )

    // Act
    const path = await tabPath.path()

    // Assert
    expect(path).toBe('C:\\Windows;C:\\Users\\ana\\AppData\\Roaming\\npm')
    expect(runs).toEqual([])
  })
})

describe('mergePaths', () => {
  it('should keep each folder once in the order first seen when paths repeat folders', () => {
    // Act
    const merged = mergePaths(':', '/usr/bin::/bin', undefined, '/bin:/opt/acme/bin:/usr/bin')

    // Assert
    expect(merged).toBe('/usr/bin:/bin:/opt/acme/bin')
  })
})
