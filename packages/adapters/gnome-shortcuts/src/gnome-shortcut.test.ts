import { silentLogger } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createGnomeShortcut, type GsettingsRunner, toGnomeBinding } from './gnome-shortcut.ts'

const OWN = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/dev-cockpit/'
const OTHER = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/'

// Imita o gsettings: guarda a lista e os campos por caminho
function fakeGsettings(initial: { list?: string[]; bindings?: Record<string, string> } = {}) {
  const state = { list: initial.list ?? [], fields: {} as Record<string, string> }
  for (const [path, binding] of Object.entries(initial.bindings ?? {}))
    state.fields[`${path}binding`] = binding
  const calls: string[][] = []
  const run: GsettingsRunner = async (args) => {
    calls.push([...args])
    const [verb, target, key, value] = args
    if (target === undefined) return { status: 1, stdout: '' }
    if (target === 'org.gnome.settings-daemon.plugins.media-keys') {
      if (verb === 'get') {
        const items = state.list.map((p) => `'${p}'`).join(', ')
        return { status: 0, stdout: state.list.length ? `[${items}]\n` : '@as []\n' }
      }
      state.list = [...(value ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '')
      return { status: 0, stdout: '' }
    }
    const path = target.slice(target.indexOf(':') + 1)
    if (verb === 'get') return { status: 0, stdout: `'${state.fields[`${path}${key}`] ?? ''}'\n` }
    state.fields[`${path}${key}`] = (value ?? '').slice(1, -1).replace(/\\'/g, "'")
    return { status: 0, stdout: '' }
  }
  return { state, calls, run }
}

const shortcut = (run: GsettingsRunner) =>
  createGnomeShortcut({
    command: ['/opt/dev-cockpit/dev-cockpit', 'toggle'],
    name: 'Dev Cockpit',
    logger: silentLogger,
    run,
  })

describe('toGnomeBinding', () => {
  it('should convert electron accelerators when they are valid', () => {
    expect(toGnomeBinding('F12')).toBe('F12')
    expect(toGnomeBinding('f9')).toBe('F9')
    expect(toGnomeBinding('Ctrl+Shift+K')).toBe('<Control><Shift>k')
    expect(toGnomeBinding('Alt+Space')).toBe('<Alt>space')
    expect(toGnomeBinding('CommandOrControl+PageUp')).toBe('<Control>Page_Up')
  })

  it('should return undefined when the key or modifier is unknown', () => {
    expect(toGnomeBinding('ControlRight')).toBeUndefined()
    expect(toGnomeBinding('Hyper+K')).toBeUndefined()
    expect(toGnomeBinding('')).toBeUndefined()
  })
})

describe('createGnomeShortcut', () => {
  it('should create the keybinding and add it to the list when it does not exist', async () => {
    const { state, run } = fakeGsettings({ list: [OTHER], bindings: { [OTHER]: 'F10' } })

    const bound = await shortcut(run).bind('F12')

    expect(bound).toBe(true)
    expect(state.list).toEqual([OTHER, OWN])
    expect(state.fields[`${OWN}binding`]).toBe('F12')
    expect(state.fields[`${OWN}command`]).toBe("'/opt/dev-cockpit/dev-cockpit' 'toggle'")
  })

  it('should update the binding without duplicating the entry when it already exists', async () => {
    const { state, run } = fakeGsettings({ list: [OWN], bindings: { [OWN]: 'F9' } })

    const bound = await shortcut(run).bind('F12')

    expect(bound).toBe(true)
    expect(state.list).toEqual([OWN])
    expect(state.fields[`${OWN}binding`]).toBe('F12')
  })

  it('should refuse and change nothing when another custom keybinding uses the key', async () => {
    const { state, calls, run } = fakeGsettings({ list: [OTHER], bindings: { [OTHER]: 'F12' } })

    const bound = await shortcut(run).bind('F12')

    expect(bound).toBe(false)
    expect(calls.some(([verb]) => verb === 'set')).toBe(false)
    expect(state.list).toEqual([OTHER])
  })

  it('should refuse when gsettings is missing', async () => {
    const run: GsettingsRunner = async () => ({ status: 'missing', stdout: '' })

    const bound = await shortcut(run).bind('F12')

    expect(bound).toBe(false)
  })

  it('should refuse when the accelerator has no gnome equivalent', async () => {
    const { calls, run } = fakeGsettings()

    const bound = await shortcut(run).bind('ControlRight')

    expect(bound).toBe(false)
    expect(calls).toEqual([])
  })
})
