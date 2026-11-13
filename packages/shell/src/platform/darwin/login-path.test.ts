import type { Logger } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { type LoginPathDeps, readLoginPath } from './login-path.ts'

function deps(run: NonNullable<LoginPathDeps['run']>) {
  const warnings: string[] = []
  const logger: Logger = {
    info() {},
    warn: (message) => void warnings.push(message),
    error() {},
  }
  return { warnings, deps: { shell: '/bin/zsh', run, logger } }
}

describe('readLoginPath', () => {
  it('should ask an interactive login shell for its PATH with a timeout when it reads', async () => {
    // Arrange
    const calls: unknown[] = []
    const { deps: options } = deps(async (file, args, timeoutMs) => {
      calls.push([file, args, timeoutMs])
      return '__DCK_PATH__/opt/homebrew/bin__DCK_PATH__'
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
    const { deps: options, warnings } = deps(
      async () => 'Welcome back, ana\n__DCK_PATH__/opt/homebrew/bin:/usr/bin__DCK_PATH__bye\n',
    )

    // Act
    const path = await readLoginPath(options)

    // Assert
    expect(path).toBe('/opt/homebrew/bin:/usr/bin')
    expect(warnings).toEqual([])
  })

  it('should return nothing and warn when the shell fails or times out', async () => {
    // Arrange
    const { deps: options, warnings } = deps(async () => {
      throw new Error('timed out')
    })

    // Act
    const path = await readLoginPath(options)

    // Assert
    expect(path).toBeUndefined()
    expect(warnings).toEqual(['login shell PATH not read, keeping the inherited one'])
  })

  it.each([
    { when: 'the marks are missing', output: '/opt/homebrew/bin:/usr/bin' },
    { when: 'an entry is relative', output: '__DCK_PATH__/usr/bin:bin__DCK_PATH__' },
    { when: 'an entry is empty', output: '__DCK_PATH__/usr/bin::/bin__DCK_PATH__' },
    { when: 'the value has a line break', output: '__DCK_PATH__/usr/bin\n/bin__DCK_PATH__' },
  ])('should return nothing and warn when $when', async ({ output }) => {
    // Arrange
    const { deps: options, warnings } = deps(async () => output)

    // Act
    const path = await readLoginPath(options)

    // Assert
    expect(path).toBeUndefined()
    expect(warnings).toEqual(['login shell PATH is not valid, keeping the inherited one'])
  })
})
