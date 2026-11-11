import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createXdgAutostart,
  defaultAutostartDirectory,
  desktopEntry,
  quoteExecArgument,
} from './xdg-autostart.ts'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-autostart-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const config = () => ({
  directory: join(directory, 'autostart'),
  name: 'Dev Cockpit',
  command: ['/opt/dck/electron', '/opt/dck/app', '--no-sandbox'],
  env: { DCK_START_HIDDEN: '1' },
})

describe('quoteExecArgument', () => {
  it('should wrap the argument in quotes when it has spaces', () => {
    expect(quoteExecArgument('/my apps/dck')).toBe('"/my apps/dck"')
  })

  it('should escape quotes, backslashes, dollars and backticks when quoting', () => {
    expect(quoteExecArgument('a"b\\c$d`e')).toBe('"a\\"b\\\\c\\$d\\`e"')
  })
})

describe('quoteExecArgument percent', () => {
  it('should double the percent sign when quoting because the format uses it for field codes', () => {
    expect(quoteExecArgument('/a/100%')).toBe('"/a/100%%"')
  })
})

describe('desktopEntry', () => {
  it('should start hidden through env and quote every command part when building the entry', () => {
    const text = desktopEntry(config())

    expect(text).toContain(
      'Exec=env DCK_START_HIDDEN=1 "/opt/dck/electron" "/opt/dck/app" "--no-sandbox"',
    )
    expect(text).toContain('Name=Dev Cockpit')
    expect(text.startsWith('[Desktop Entry]')).toBe(true)
  })

  it('should leave env out when there are no variables', () => {
    const text = desktopEntry({ ...config(), env: {} })

    expect(text).toContain('Exec="/opt/dck/electron"')
    expect(text).not.toContain('Exec=env')
  })
})

describe('createXdgAutostart', () => {
  it('should be disabled when no entry file exists', async () => {
    expect(await createXdgAutostart(config()).isEnabled()).toBe(false)
  })

  it('should create the entry and report enabled when enabling', async () => {
    const autostart = createXdgAutostart(config())

    await autostart.setEnabled(true)

    expect(await autostart.isEnabled()).toBe(true)
    const text = await readFile(join(directory, 'autostart', 'dev-cockpit.desktop'), 'utf8')
    expect(text).toContain('Exec=')
  })

  it('should remove the entry and report disabled when disabling', async () => {
    const autostart = createXdgAutostart(config())
    await autostart.setEnabled(true)

    await autostart.setEnabled(false)

    expect(await autostart.isEnabled()).toBe(false)
  })

  it('should not fail when disabling something that was never enabled', async () => {
    await expect(createXdgAutostart(config()).setEnabled(false)).resolves.toBeUndefined()
  })
})

describe('defaultAutostartDirectory', () => {
  it('should use xdg config home when it is set', () => {
    expect(defaultAutostartDirectory({ XDG_CONFIG_HOME: '/x/cfg' }, '/home/u')).toBe(
      '/x/cfg/autostart',
    )
  })

  it('should fall back to the config folder in the home directory when it is not set', () => {
    expect(defaultAutostartDirectory({}, '/home/u')).toBe('/home/u/.config/autostart')
  })
})
