import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Autostart } from '@dck/core'

export interface AutostartConfig {
  // XDG autostart directory, normally ~/.config/autostart
  readonly directory: string
  readonly name: string
  readonly command: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

// Exec argument of a .desktop: quoted, with what the format treats as special escaped
export function quoteExecArgument(argument: string): string {
  return `"${argument.replace(/%/g, '%%').replace(/(["`$\\])/g, '\\$1')}"`
}

export function desktopEntry(config: AutostartConfig): string {
  const env = Object.entries(config.env ?? {}).map(([key, value]) => `${key}=${value}`)
  const exec = [
    ...(env.length > 0 ? ['env', ...env] : []),
    ...config.command.map(quoteExecArgument),
  ]
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${config.name}`,
    `Exec=${exec.join(' ')}`,
    'X-GNOME-Autostart-enabled=true',
    'Terminal=false',
    '',
  ].join('\n')
}

export function createXdgAutostart(config: AutostartConfig): Autostart {
  const file = join(config.directory, 'dev-cockpit.desktop')
  return {
    async isEnabled() {
      const text = await readFile(file, 'utf8').catch(() => undefined)
      return text !== undefined && !/^Hidden=true$/m.test(text)
    },
    async setEnabled(enabled) {
      if (!enabled) {
        await rm(file, { force: true })
        return
      }
      await mkdir(config.directory, { recursive: true })
      await writeFile(file, desktopEntry(config))
    },
  }
}

export function defaultAutostartDirectory(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'autostart')
}
