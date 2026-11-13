import { join } from 'node:path'
import { createGnomeShortcut } from '@dck/adapter-gnome-shortcuts'
import * as linuxProc from '@dck/adapter-linux-proc'
import * as macosProc from '@dck/adapter-macos-proc'
import { createSecretToolStore } from '@dck/adapter-secret-tool'
import type {
  Autostart,
  DesktopShortcut,
  Logger,
  ProcessInspector,
  ProcessScanner,
  SecretStore,
} from '@dck/core'
import { createXdgAutostart, defaultAutostartDirectory } from './linux/xdg-autostart.ts'

export interface PlatformContext {
  readonly platform: NodeJS.Platform
  readonly env: Readonly<Record<string, string | undefined>>
  readonly home: string
  readonly packaged: boolean
  readonly execPath: string
  readonly appPath: string
  readonly resourcesPath: string
  readonly logger: Logger
}

export interface Platform {
  readonly processes: ProcessInspector
  readonly processScanner: ProcessScanner
  readonly secrets: SecretStore
  readonly autostart: Autostart
  readonly desktopShortcut: DesktopShortcut | undefined
}

// Exported so a test can check which adapter a platform gets without inspecting the system
export const processAdapters = (platform: NodeJS.Platform) =>
  platform === 'darwin' ? macosProc : linuxProc

// macOS still gets the Linux secret store and autostart until MAC-T3 and T8 replace them
export function selectPlatform(context: PlatformContext): Platform {
  const { platform, env, home, packaged, execPath, appPath, resourcesPath, logger } = context
  const onGnome =
    platform === 'linux' && (env.XDG_CURRENT_DESKTOP ?? '').split(':').includes('GNOME')
  // A Linux workaround for Chromium's sandbox helper; the Mac runs with the sandbox
  const sandbox = platform === 'linux' ? ['--no-sandbox'] : []
  const app = packaged ? [execPath] : [execPath, appPath]
  const proc = processAdapters(platform)

  return {
    processes: proc.createProcessInspector(),
    processScanner: proc.createProcessScanner(),
    secrets: createSecretToolStore(),
    autostart: createXdgAutostart({
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
  }
}
