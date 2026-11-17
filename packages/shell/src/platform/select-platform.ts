import { join } from 'node:path'
import { createGnomeShortcut } from '@dck/adapter-gnome-shortcuts'
import * as linuxProc from '@dck/adapter-linux-proc'
import * as macosProc from '@dck/adapter-macos-proc'
import type {
  Autostart,
  DesktopShortcut,
  Logger,
  ProcessInspector,
  ProcessScanner,
  PtyOptions,
  SecretStore,
} from '@dck/core'
import { systemSecretStore } from '@dck/daemon/secret-store'
import { createLaunchdAutostart } from './darwin/launchd-autostart.ts'
import { createPanelWindow, type PanelApp } from './darwin/panel-window.ts'
import { createRegularWindow } from './linux/regular-window.ts'
import { createXdgAutostart, defaultAutostartDirectory } from './linux/xdg-autostart.ts'
import type { PlatformWindow } from './platform-window.ts'
import { readShellPath } from './shell-path.ts'

export interface PlatformContext {
  readonly platform: NodeJS.Platform
  readonly env: Readonly<Record<string, string | undefined>>
  readonly home: string
  readonly packaged: boolean
  readonly execPath: string
  readonly appPath: string
  readonly resourcesPath: string
  readonly logger: Logger
  // Electron's app, which the Mac panel activates, hides and keeps out of the Dock
  readonly app: PanelApp
}

export interface Platform {
  readonly processes: ProcessInspector
  readonly processScanner: ProcessScanner
  readonly secrets: SecretStore
  readonly autostart: Autostart
  readonly desktopShortcut: DesktopShortcut | undefined
  readonly terminal: Pick<PtyOptions, 'file' | 'args'>
  // The PATH child processes should get, or undefined to keep the inherited one
  loginPath(): Promise<string | undefined>
  readonly window: PlatformWindow
}

// Exported so a test can check which adapter a platform gets without inspecting the system
export const processAdapters = (platform: NodeJS.Platform) =>
  platform === 'darwin' ? macosProc : linuxProc

// The UI is text on the DOM, which Chromium composites in software on Linux; the GPU process cost
// about 25 MB idle (D50). The Mac keeps it until it is measured there
export const usesGpu = (platform: NodeJS.Platform) => platform !== 'linux'

// Electron runs as a Wayland client in a Wayland session unless told to use XWayland
export const nativeWayland = (
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  commandLine: { getSwitchValue(name: string): string },
) =>
  platform === 'linux' &&
  env.XDG_SESSION_TYPE === 'wayland' &&
  commandLine.getSwitchValue('ozone-platform') !== 'x11'

export function selectPlatform(context: PlatformContext): Platform {
  const { platform, env, home, packaged, execPath, appPath, resourcesPath, logger } = context
  const onGnome =
    platform === 'linux' && (env.XDG_CURRENT_DESKTOP ?? '').split(':').includes('GNOME')
  const terminal =
    platform === 'darwin'
      ? { file: env.SHELL ?? '/bin/zsh', args: ['-l'] }
      : { file: env.SHELL ?? '/bin/bash', args: [] }
  // A Linux workaround for Chromium's sandbox helper; the Mac runs with the sandbox
  const sandbox = platform === 'linux' ? ['--no-sandbox'] : []
  const app = packaged ? [execPath] : [execPath, appPath]
  const proc = processAdapters(platform)

  return {
    processes: proc.createProcessInspector(),
    processScanner: proc.createProcessScanner(),
    secrets: systemSecretStore(platform),
    autostart:
      platform === 'darwin'
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
    loginPath: async () =>
      platform === 'darwin'
        ? readShellPath({ shell: terminal.file, flags: ['-i', '-l'], logger })
        : undefined,
    window: platform === 'darwin' ? createPanelWindow(context.app) : createRegularWindow(),
  }
}
