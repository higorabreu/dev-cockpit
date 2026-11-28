import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGnomeShortcut } from '@dck/adapter-gnome-shortcuts'
import * as linuxProc from '@dck/adapter-linux-proc'
import * as macosProc from '@dck/adapter-macos-proc'
import * as windowsProc from '@dck/adapter-windows-proc'
import {
  type Autostart,
  type DesktopShortcut,
  type Logger,
  noSystemFonts,
  type ProcessInspector,
  type ProcessScanner,
  type PtyOptions,
  type SecretStore,
  type SystemFonts,
  type TerminalShell,
  type UpdateInstaller,
} from '@dck/core'
import { systemSecretStore } from '@dck/daemon/secret-store'
import { createLaunchdAutostart } from './darwin/launchd-autostart.ts'
import { readLoginPath } from './darwin/login-path.ts'
import { createPanelWindow, type PanelApp } from './darwin/panel-window.ts'
import { createDebInstaller, runProgram } from './linux/deb-installer.ts'
import { createRegularWindow } from './linux/regular-window.ts'
import { createLinuxSystemFonts, runCommand } from './linux/system-fonts.ts'
import { createXdgAutostart, defaultAutostartDirectory } from './linux/xdg-autostart.ts'
import type { PlatformWindow } from './platform-window.ts'
import { createLoginItemAutostart, type LoginItems } from './win32/login-item-autostart.ts'
import { windowsShells } from './win32/shells.ts'

export interface PlatformContext {
  readonly platform: NodeJS.Platform
  readonly env: Readonly<Record<string, string | undefined>>
  readonly home: string
  readonly packaged: boolean
  readonly execPath: string
  readonly appPath: string
  readonly resourcesPath: string
  readonly appVersion: string
  readonly logger: Logger
  // Electron's app, which the Mac panel activates, hides and keeps out of the Dock, and which keeps
  // Windows' login items
  readonly app: PanelApp & LoginItems
  // The directory each terminal's shell reported, where the system keeps none readable (Windows)
  readonly terminalDirectory?: (pid: number) => string | undefined
}

export interface Platform {
  readonly processes: ProcessInspector
  readonly processScanner: ProcessScanner
  readonly secrets: SecretStore
  readonly autostart: Autostart
  readonly desktopShortcut: DesktopShortcut | undefined
  readonly terminal: Pick<PtyOptions, 'file' | 'args'>
  // The shells a new tab can start: found without a process, with the chosen one if it is a WSL
  // distribution (installed), or with every distribution (list); empty where the tabs follow $SHELL
  readonly shells: {
    installed(chosen: string | null): readonly TerminalShell[]
    list(): Promise<readonly TerminalShell[]>
  }
  // The PATH child processes should get, or undefined to keep the inherited one
  loginPath(): Promise<string | undefined>
  readonly window: PlatformWindow
  readonly fonts: SystemFonts
  // Undefined where the cockpit cannot replace itself: it then only points to the release page
  readonly updateInstaller: UpdateInstaller | undefined
  // ⌘Q asks first while a tab runs a program (D75); Linux quits at once from the tray
  readonly asksBeforeQuit: boolean
}

// Exported so a test can check which adapter a platform gets without inspecting the system
export const processAdapters = (platform: NodeJS.Platform) =>
  platform === 'darwin' ? macosProc : linuxProc

// Electron runs as a Wayland client in a Wayland session unless told to use XWayland
export const nativeWayland = (
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  commandLine: { getSwitchValue(name: string): string },
) =>
  platform === 'linux' &&
  env.XDG_SESSION_TYPE === 'wayland' &&
  commandLine.getSwitchValue('ozone-platform') !== 'x11'

// Only the .deb installs in /opt/dev-cockpit; a development run installs only against a local test feed
export const installsDeb = (context: PlatformContext) =>
  context.platform === 'linux' &&
  (context.packaged
    ? context.execPath.startsWith('/opt/dev-cockpit/')
    : context.env.DCK_UPDATE_FEED !== undefined)

export function selectPlatform(context: PlatformContext): Platform {
  const { platform, env, home, packaged, execPath, appPath, resourcesPath, logger } = context
  const onGnome =
    platform === 'linux' && (env.XDG_CURRENT_DESKTOP ?? '').split(':').includes('GNOME')
  const shells =
    platform === 'win32'
      ? windowsShells(env)
      : { installed: () => [], list: async () => [] as readonly TerminalShell[] }
  // Windows has no $SHELL: its first shell found, else Windows PowerShell, which every Windows has
  const terminal =
    platform === 'darwin'
      ? { file: env.SHELL ?? '/bin/zsh', args: ['-l'] }
      : platform === 'win32'
        ? (shells.installed(null)[0] ?? { file: 'powershell.exe', args: ['-NoLogo'] })
        : { file: env.SHELL ?? '/bin/bash', args: [] }
  // A Linux workaround for Chromium's sandbox helper; the Mac runs with the sandbox
  const sandbox = platform === 'linux' ? ['--no-sandbox'] : []
  const app = packaged ? [execPath] : [execPath, appPath]
  const proc = processAdapters(platform)

  return {
    processes:
      platform === 'win32'
        ? windowsProc.createProcessInspector({
            cwdOf: context.terminalDirectory ?? (() => undefined),
          })
        : proc.createProcessInspector(),
    processScanner:
      platform === 'win32' ? windowsProc.createProcessScanner() : proc.createProcessScanner(),
    secrets: systemSecretStore(platform),
    autostart:
      platform === 'win32'
        ? createLoginItemAutostart(context.app, app)
        : platform === 'darwin'
          ? createLaunchdAutostart({
              directory: env.DCK_AUTOSTART_DIR ?? join(home, 'Library', 'LaunchAgents'),
              // The bundle identifier package-mac.mjs gives the app
              label: 'io.github.devcockpit',
              command: app,
              env: { DCK_START_HIDDEN: '1' },
            })
          : createXdgAutostart({
              directory: env.DCK_AUTOSTART_DIR ?? defaultAutostartDirectory(env, home),
              name: 'Dev Cockpit',
              command: [...app, ...sandbox],
              env: { DCK_START_HIDDEN: '1' },
            }),
    // The system shortcut calls the packaged CLI; in dev mode Electron registers the key
    desktopShortcut:
      packaged && onGnome
        ? createGnomeShortcut({
            command: [
              'env',
              'ELECTRON_RUN_AS_NODE=1',
              'DCK_PACKAGED=1',
              execPath,
              join(resourcesPath, 'dck.mjs'),
              'toggle',
            ],
            name: 'Dev Cockpit',
            logger,
          })
        : undefined,
    // The Mac opens a login shell, like Terminal.app, so `.zprofile` runs in every tab
    terminal,
    shells,
    loginPath: async () =>
      platform === 'darwin' ? readLoginPath({ shell: terminal.file, logger }) : undefined,
    window: platform === 'darwin' ? createPanelWindow(context.app) : createRegularWindow(),
    // The Mac names no terminal font yet: the terminal draws with the cockpit's own
    fonts:
      platform === 'linux'
        ? createLinuxSystemFonts(runCommand)
        : { read: async () => noSystemFonts },
    updateInstaller: installsDeb(context)
      ? createDebInstaller({
          fetch,
          run: runProgram,
          tempRoot: tmpdir(),
          userAgent: `dev-cockpit/${context.appVersion}`,
          logger,
        })
      : undefined,
    asksBeforeQuit: platform === 'darwin',
  }
}
