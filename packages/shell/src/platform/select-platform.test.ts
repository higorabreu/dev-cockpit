import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type PlatformContext, selectPlatform } from './select-platform.ts'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-platform-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const context = (overrides: Partial<PlatformContext>): PlatformContext => ({
  platform: 'linux',
  env: { DCK_AUTOSTART_DIR: directory, XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' },
  home: '/home/ana',
  packaged: true,
  execPath: '/opt/dck/electron',
  appPath: '/opt/dck/app',
  resourcesPath: '/opt/dck/resources',
  logger: silentLogger,
  ...overrides,
})

describe('selectPlatform', () => {
  it.each([
    {
      expected: 'bind the key through GNOME',
      when: 'the packaged app runs on a GNOME desktop',
      overrides: {},
      bound: true,
    },
    {
      expected: 'leave the key to Electron',
      when: 'the packaged app runs on a desktop other than GNOME',
      overrides: { env: { DCK_AUTOSTART_DIR: directory, XDG_CURRENT_DESKTOP: 'KDE' } },
      bound: false,
    },
    {
      expected: 'leave the key to Electron',
      when: 'the app runs from the repository',
      overrides: { packaged: false },
      bound: false,
    },
    {
      expected: 'leave the key to Electron',
      when: 'the app runs on macOS',
      overrides: { platform: 'darwin' as const },
      bound: false,
    },
  ])('should $expected when $when', ({ overrides, bound }) => {
    // Arrange
    const selected = context(overrides)

    // Act
    const platform = selectPlatform(selected)

    // Assert
    expect(platform.desktopShortcut !== undefined).toBe(bound)
  })

  it.each([
    {
      expected: 'start the app without the sandbox',
      when: 'autostart runs it on Linux',
      overrides: {},
      exec: 'Exec=env DCK_START_HIDDEN=1 "/opt/dck/electron" "--no-sandbox"',
    },
    {
      expected: 'keep the sandbox',
      when: 'autostart runs the app on macOS',
      overrides: { platform: 'darwin' as const },
      exec: 'Exec=env DCK_START_HIDDEN=1 "/opt/dck/electron"',
    },
    {
      expected: 'start the repository app',
      when: 'autostart runs a development build',
      overrides: { packaged: false },
      exec: 'Exec=env DCK_START_HIDDEN=1 "/opt/dck/electron" "/opt/dck/app" "--no-sandbox"',
    },
  ])('should $expected when $when', async ({ overrides, exec }) => {
    // Arrange
    const { autostart } = selectPlatform(context(overrides))

    // Act
    await autostart.setEnabled(true)

    // Assert
    const entry = await readFile(join(directory, 'dev-cockpit.desktop'), 'utf8')
    expect(entry.split('\n')).toContain(exec)
  })

  it.each([
    {
      expected: 'open the SHELL as a login shell',
      when: 'the app runs on macOS',
      overrides: { platform: 'darwin' as const, env: { SHELL: '/opt/homebrew/bin/fish' } },
      terminal: { file: '/opt/homebrew/bin/fish', args: ['-l'] },
    },
    {
      expected: 'open zsh as a login shell',
      when: 'macOS gives no SHELL',
      overrides: { platform: 'darwin' as const, env: {} },
      terminal: { file: '/bin/zsh', args: ['-l'] },
    },
    {
      expected: 'open the SHELL as it is',
      when: 'the app runs on Linux',
      overrides: { env: { SHELL: '/usr/bin/fish' } },
      terminal: { file: '/usr/bin/fish', args: [] },
    },
    {
      expected: 'open bash',
      when: 'Linux gives no SHELL',
      overrides: { env: {} },
      terminal: { file: '/bin/bash', args: [] },
    },
  ])('should $expected when $when', ({ overrides, terminal }) => {
    // Arrange
    const selected = context(overrides)

    // Act
    const platform = selectPlatform(selected)

    // Assert
    expect(platform.terminal).toEqual(terminal)
  })

  it('should keep the inherited PATH when the app runs on Linux', async () => {
    // Arrange
    const platform = selectPlatform(context({}))

    // Act
    const path = await platform.loginPath()

    // Assert
    expect(path).toBeUndefined()
  })
})
