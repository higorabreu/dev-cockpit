import { spawn } from 'node:child_process'
import type { DesktopShortcut, Logger } from '@dck/core'

const TIMEOUT_MS = 5000
const MEDIA_KEYS = 'org.gnome.settings-daemon.plugins.media-keys'
const ENTRY_SCHEMA = `${MEDIA_KEYS}.custom-keybinding`
const ENTRY_PATH = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/dev-cockpit/'

export interface GsettingsRun {
  // `missing` when the executable does not exist
  readonly status: number | 'missing'
  readonly stdout: string
}

export type GsettingsRunner = (args: readonly string[]) => Promise<GsettingsRun>

const runGsettings: GsettingsRunner = (args) =>
  new Promise((resolve) => {
    const child = spawn('gsettings', [...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: TIMEOUT_MS,
    })
    let stdout = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.on('error', (error: NodeJS.ErrnoException) =>
      resolve({ status: error.code === 'ENOENT' ? 'missing' : 1, stdout: '' }),
    )
    child.on('close', (status) => resolve({ status: status ?? 1, stdout }))
  })

const MODIFIERS: Readonly<Record<string, string>> = {
  ctrl: '<Control>',
  control: '<Control>',
  commandorcontrol: '<Control>',
  cmdorctrl: '<Control>',
  shift: '<Shift>',
  alt: '<Alt>',
  option: '<Alt>',
  super: '<Super>',
  meta: '<Super>',
}

const KEYS: Readonly<Record<string, string>> = {
  space: 'space',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  enter: 'Return',
  return: 'Return',
  backspace: 'BackSpace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'Page_Up',
  pagedown: 'Page_Down',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
}

// Electron accelerator ("Ctrl+Shift+K", "F12") to GNOME format ("<Control><Shift>k")
export function toGnomeBinding(accelerator: string): string | undefined {
  const parts = accelerator.split('+').map((part) => part.trim())
  const key = parts.pop()
  if (!key) return undefined
  let modifiers = ''
  for (const part of parts) {
    const modifier = MODIFIERS[part.toLowerCase()]
    if (!modifier) return undefined
    modifiers += modifier
  }
  const lower = key.toLowerCase()
  if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) return `${modifiers}${key.toUpperCase()}`
  if (/^[a-z0-9]$/.test(lower)) return `${modifiers}${lower}`
  const named = KEYS[lower]
  return named ? `${modifiers}${named}` : undefined
}

// Vira um GVariant string entre aspas simples
const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const shellQuote = (argument: string) => `'${argument.replace(/'/g, `'\\''`)}'`

const parsePaths = (stdout: string) => [...stdout.matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '')

const parseString = (stdout: string) => parsePaths(stdout)[0]

export interface GnomeShortcutDependencies {
  readonly command: readonly string[]
  readonly name: string
  readonly logger: Logger
  readonly run?: GsettingsRunner
}

export function createGnomeShortcut(dependencies: GnomeShortcutDependencies): DesktopShortcut {
  const { command, name, logger } = dependencies
  const run = dependencies.run ?? runGsettings
  const commandLine = command.map(shellQuote).join(' ')

  const read = async (args: readonly string[]) => {
    const result = await run(['get', ...args])
    return result.status === 0 ? result.stdout : undefined
  }

  const write = async (args: readonly string[]) => {
    const result = await run(['set', ...args])
    if (result.status !== 0) logger.warn('gsettings write failed', { args, status: result.status })
    return result.status === 0
  }

  const bindingOf = async (path: string) =>
    parseString((await read([`${ENTRY_SCHEMA}:${path}`, 'binding'])) ?? '')

  return {
    async bind(accelerator) {
      const binding = toGnomeBinding(accelerator)
      if (!binding) {
        logger.warn('shortcut has no gnome equivalent', { accelerator })
        return false
      }
      const listed = await read([MEDIA_KEYS, 'custom-keybindings'])
      if (listed === undefined) {
        logger.warn('could not read gnome custom keybindings', { accelerator })
        return false
      }
      const paths = parsePaths(listed)
      for (const path of paths.filter((entry) => entry !== ENTRY_PATH)) {
        if ((await bindingOf(path)) === binding) {
          logger.warn('shortcut is used by another custom keybinding', { accelerator, path })
          return false
        }
      }
      const entry = `${ENTRY_SCHEMA}:${ENTRY_PATH}`
      const written =
        (await write([entry, 'name', quote(name)])) &&
        (await write([entry, 'command', quote(commandLine)])) &&
        (await write([entry, 'binding', quote(binding)]))
      if (!written) return false
      if (paths.includes(ENTRY_PATH)) return true
      const list = [...paths, ENTRY_PATH].map(quote).join(', ')
      return write([MEDIA_KEYS, 'custom-keybindings', `[${list}]`])
    },
  }
}
