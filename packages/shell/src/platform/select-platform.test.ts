import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as linuxProc from '@dck/adapter-linux-proc'
import * as macosProc from '@dck/adapter-macos-proc'
import { silentLogger } from '@dck/core'
import { FakeDockWindow } from '@dck/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PlacedWindow } from './platform-window.ts'
import {
  installsDeb,
  nativeWayland,
  type PlatformContext,
  processAdapters,
  selectPlatform,
} from './select-platform.ts'

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
  appVersion: '0.9.0',
  logger: silentLogger,
  app: {
    focus: () => undefined,
    hide: () => undefined,
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: () => undefined,
  },
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
      when: 'the .deb runs from /opt/dev-cockpit',
      overrides: { execPath: '/opt/dev-cockpit/dev-cockpit' },
      expected: true,
    },
    { when: 'the app runs packaged from another folder', overrides: {}, expected: false },
    {
      when: 'a packaged app is given a test feed',
      overrides: { env: { DCK_UPDATE_FEED: 'http://127.0.0.1:4000' } },
      expected: false,
    },
    {
      when: 'a development build is given a test feed',
      overrides: { packaged: false, env: { DCK_UPDATE_FEED: 'http://127.0.0.1:4000' } },
      expected: true,
    },
    {
      when: 'a development build has no test feed',
      overrides: { packaged: false },
      expected: false,
    },
    {
      when: 'the app runs on macOS',
      overrides: { platform: 'darwin' as const, execPath: '/opt/dev-cockpit/dev-cockpit' },
      expected: false,
    },
  ])('should install updates $expected when $when', ({ overrides, expected }) => {
    const selected = context(overrides)

    expect(installsDeb(selected)).toBe(expected)
    expect(selectPlatform(selected).updateInstaller !== undefined).toBe(expected)
  })

  it('should start the app hidden through a LaunchAgent with the sandbox when the platform is macOS', async () => {
    // Arrange
    const { autostart } = selectPlatform(context({ platform: 'darwin' }))

    // Act
    await autostart.setEnabled(true)

    // Assert
    const job = await readFile(join(directory, 'io.github.devcockpit.plist'), 'utf8')
    expect(job).toContain('<array>\n    <string>/opt/dck/electron</string>\n  </array>')
    expect(job).toContain('<key>DCK_START_HIDDEN</key>')
    expect(job).not.toContain('--no-sandbox')
  })

  it('should start the app hidden with Windows through its login items when the platform is Windows', async () => {
    // Arrange
    const saved: { openAtLogin: boolean; path: string; args: string[] }[] = []
    const app = {
      focus: () => undefined,
      hide: () => undefined,
      getLoginItemSettings: () => ({ openAtLogin: false }),
      setLoginItemSettings: (settings: (typeof saved)[number]) => void saved.push(settings),
    }
    const { autostart } = selectPlatform(
      context({ platform: 'win32', execPath: 'C:\\dck\\Dev Cockpit.exe', app }),
    )

    // Act
    await autostart.setEnabled(true)

    // Assert
    expect(saved).toEqual([
      { openAtLogin: true, path: 'C:\\dck\\Dev Cockpit.exe', args: ['--start-hidden'] },
    ])
    expect(await readdir(directory)).toEqual([])
  })

  it('should open Windows PowerShell when Windows has no other shell on the path', () => {
    // Arrange
    const selected = context({ platform: 'win32', env: { SystemRoot: 'C:\\Windows', Path: '' } })

    // Act
    const platform = selectPlatform(selected)

    // Assert
    expect(platform.terminal.file).toMatch(/powershell\.exe$/i)
    expect(platform.desktopShortcut).toBeUndefined()
    expect(platform.updateInstaller).toBeUndefined()
  })

  it.each([
    { when: 'a Wayland session', session: 'wayland', ozone: '', expected: true },
    { when: 'an X11 session', session: 'x11', ozone: '', expected: false },
    {
      when: 'a Wayland session forced to XWayland',
      session: 'wayland',
      ozone: 'x11',
      expected: false,
    },
  ])(
    'should run as a Wayland client $expected when it is $when',
    ({ session, ozone, expected }) => {
      // Act
      const native = nativeWayland(
        'linux',
        { XDG_SESSION_TYPE: session },
        { getSwitchValue: () => ozone },
      )

      // Assert
      expect(native).toBe(expected)
    },
  )

  it.each([
    { name: 'macos-proc', platform: 'darwin' as const, expected: macosProc },
    { name: 'linux-proc', platform: 'linux' as const, expected: linuxProc },
  ])(
    'should inspect processes with $name when the platform is $platform',
    ({ platform, expected }) => {
      // Act
      const adapters = processAdapters(platform)

      // Assert
      expect(adapters).toBe(expected)
    },
  )

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

  it.each([
    { platform: 'darwin' as const, expected: true },
    { platform: 'linux' as const, expected: false },
  ])(
    'should ask before quitting only on a Mac when the app runs on $platform',
    ({ platform, expected }) => {
      expect(selectPlatform(context({ platform })).asksBeforeQuit).toBe(expected)
    },
  )

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
