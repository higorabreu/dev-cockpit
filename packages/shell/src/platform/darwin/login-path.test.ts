import { execFileSync } from 'node:child_process'
import type { Logger } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { type LoginPathDeps, readLoginPath, runLoginShell, type ShellRun } from './login-path.ts'

function deps(run: NonNullable<LoginPathDeps['run']>) {
  const warnings: string[] = []
  const contexts: unknown[] = []
  const logger: Logger = {
    info() {},
    warn: (message, context) => {
      warnings.push(message)
      contexts.push(context)
    },
    error() {},
  }
  return { warnings, contexts, deps: { shell: '/bin/zsh', run, logger } }
}

const printed = (output: string): ShellRun => ({ kind: 'output', output })

describe('readLoginPath', () => {
  it('should ask an interactive login shell for its PATH with a timeout when it reads', async () => {
    // Arrange
    const calls: unknown[] = []
    const { deps: options } = deps(async (file, args, timeoutMs) => {
      calls.push([file, args, timeoutMs])
      return printed('__DCK_PATH__/opt/homebrew/bin__DCK_PATH__')
    })

    // Act
    await readLoginPath(options)

    // Assert
    expect(calls).toEqual([
      ['/bin/zsh', ['-ilc', `printf '__DCK_PATH__%s__DCK_PATH__' "$PATH"`], 2000],
    ])
  })

  it('should return the PATH between the marks when the startup files print around it', async () => {
    // Arrange
    const { deps: options, warnings } = deps(async () =>
      printed('Welcome back, ana\n__DCK_PATH__/opt/homebrew/bin:/usr/bin__DCK_PATH__bye\n'),
    )

    // Act
    const path = await readLoginPath(options)

    // Assert
    expect(path).toBe('/opt/homebrew/bin:/usr/bin')
    expect(warnings).toEqual([])
  })

  it('should return nothing and log only how the shell ended when it fails or times out', async () => {
    // Arrange
    const {
      deps: options,
      warnings,
      contexts,
    } = deps(async () => ({
      kind: 'failed',
      code: null,
      signal: 'SIGKILL',
      timedOut: true,
    }))

    // Act
    const path = await readLoginPath(options)

    // Assert
    expect(path).toBeUndefined()
    expect(warnings).toEqual(['login shell PATH not read, keeping the inherited one'])
    expect(contexts).toEqual([{ shell: '/bin/zsh', code: null, signal: 'SIGKILL', timedOut: true }])
  })

  it.each([
    { when: 'the marks are missing', output: '/opt/homebrew/bin:/usr/bin' },
    { when: 'an entry is relative', output: '__DCK_PATH__/usr/bin:bin__DCK_PATH__' },
    { when: 'an entry is empty', output: '__DCK_PATH__/usr/bin::/bin__DCK_PATH__' },
    { when: 'the value has a line break', output: '__DCK_PATH__/usr/bin\n/bin__DCK_PATH__' },
  ])('should return nothing and warn when $when', async ({ output }) => {
    // Arrange
    const { deps: options, warnings } = deps(async () => printed(output))

    // Act
    const path = await readLoginPath(options)

    // Assert
    expect(path).toBeUndefined()
    expect(warnings).toEqual(['login shell PATH is not valid, keeping the inherited one'])
  })
})

// Real processes: what matters here is how the operating system stops a shell that will not end
describe('runLoginShell', () => {
  const running = (command: string) =>
    execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' })
      .split('\n')
      .some((line) => line.trim() === command)
  const gone = async (command: string) => {
    for (let attempt = 0; attempt < 20 && running(command); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 25))
    return !running(command)
  }

  it('should give up within the timeout and leave no process when the shell ignores SIGTERM', async () => {
    // Arrange
    const started = Date.now()

    // Act
    const result = await runLoginShell('/bin/sh', ['-c', "trap '' TERM; sleep 7.31; :"], 200)

    // Assert
    expect(result).toEqual({ kind: 'failed', code: null, signal: 'SIGKILL', timedOut: true })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(await gone('sleep 7.31')).toBe(true)
  })

  it('should return as soon as the closing mark arrives when the shell keeps running after it', async () => {
    // Arrange
    const started = Date.now()

    // Act
    const result = await runLoginShell(
      '/bin/sh',
      ['-c', "printf 'hi __DCK_PATH__/usr/bin__DCK_PATH__'; sleep 7.32; :"],
      5000,
    )

    // Assert
    expect(result).toEqual(printed('hi __DCK_PATH__/usr/bin__DCK_PATH__'))
    expect(Date.now() - started).toBeLessThan(1000)
    expect(await gone('sleep 7.32')).toBe(true)
  })

  it('should not wait for input when the startup files read from stdin', async () => {
    // Arrange
    const script = "read answer; printf '__DCK_PATH__/bin__DCK_PATH__'"

    // Act
    const result = await runLoginShell('/bin/sh', ['-c', script], 1000)

    // Assert
    expect(result).toEqual(printed('__DCK_PATH__/bin__DCK_PATH__'))
  })

  it('should stop reading at the cap when the shell prints without end', async () => {
    // Arrange
    const started = Date.now()

    // Act
    const result = await runLoginShell('/bin/sh', ['-c', 'yes; :'], 5000)

    // Assert
    expect(result.kind === 'output' && result.output.length).toBe(64 * 1024)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('should report the exit code and not the error output when the shell fails', async () => {
    // Arrange
    const script = 'echo token=SECRET123 >&2; exit 3'

    // Act
    const result = await runLoginShell('/bin/sh', ['-c', script], 1000)

    // Assert
    expect(result).toEqual({ kind: 'failed', code: 3, signal: null, timedOut: false })
  })

  it('should report the system error code when the shell does not exist', async () => {
    // Act
    const result = await runLoginShell('/nonexistent/shell', ['-c', ':'], 1000)

    // Assert
    expect(result).toEqual({ kind: 'failed', code: 'ENOENT', signal: null, timedOut: false })
  })
})
