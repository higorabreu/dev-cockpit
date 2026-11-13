import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { silentLogger } from '@dck/core'
import { FakeDockWindow } from '@dck/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PlacedWindow } from './platform-window.ts'
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
  app: { focus: () => undefined, hide: () => undefined },
  ...overrides,
})

// Records each window call with its arguments, so a missing or extra argument shows up
function recordingWindow(calls: unknown[][]): PlacedWindow {
  return {
    setAlwaysOnTop: (...args) => void calls.push(['setAlwaysOnTop', ...args]),
    setVisibleOnAllWorkspaces: (...args) => void calls.push(['setVisibleOnAllWorkspaces', ...args]),
  }
}

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
      expected: 'open a panel with its own app menu',
      when: 'the app runs on macOS',
      platform: 'darwin' as const,
      options: { type: 'panel' },
      menu: true,
    },
    {
      expected: 'open a regular window with no app menu',
      when: 'the app runs on Linux',
      platform: 'linux' as const,
      options: {},
      menu: false,
    },
  ])('should $expected when $when', ({ platform, options, menu }) => {
    // Arrange
    const selected = context({ platform })

    // Act
    const { window } = selectPlatform(selected)

    // Assert
    expect(window.options).toStrictEqual(options)
    expect(window.menu !== undefined).toBe(menu)
  })

  it('should keep the window on every workspace and its focus as it is when the app runs on Linux', () => {
    // Arrange
    const { window } = selectPlatform(context({}))
    const calls: unknown[][] = []
    const dockWindow = new FakeDockWindow()

    // Act
    window.place(recordingWindow(calls))
    const docked = window.dock(dockWindow, { focus: () => calls.push(['contents.focus']) })

    // Assert
    expect(calls).toEqual([['setVisibleOnAllWorkspaces', true]])
    expect(docked).toBe(dockWindow)
  })
})
