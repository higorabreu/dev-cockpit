// @vitest-environment happy-dom
import {
  createTranslator,
  defaultSettings,
  type HostApi,
  mergeSettings,
  type Settings,
  type SettingsFileState,
  type SettingsPatch,
  settingsFileOk,
} from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { inputGate } from '../platform/input-gate.ts'
import { createKeymap, type Keyboard } from '../platform/keymap.ts'
import type { SettingsClient } from './settings-client.ts'
import { createSettingsView } from './settings-view.ts'

const api = {
  connections: { list: async () => [], disabled: async () => [], status: async () => undefined },
  autostart: { isEnabled: async () => false },
  fonts: {
    system: async () => ({
      terminal: null,
      monospace: null,
      families: [],
      monospaceFamilies: [],
      symbols: [],
    }),
  },
} as unknown as HostApi

let close: () => void = () => undefined

afterEach(() => close())

// The Settings screen on its Shortcuts page, over a settings client that keeps what it is given
function openShortcuts(
  initial: Settings = defaultSettings,
  keyboard: Keyboard = 'pc',
  file: SettingsFileState = settingsFileOk,
) {
  document.body.replaceChildren()
  const overlay = document.createElement('div')
  const body = document.createElement('div')
  overlay.append(body)
  document.body.append(overlay)
  let current = initial
  const patches: SettingsPatch[] = []
  const client: SettingsClient = {
    current: () => current,
    locked: () => [],
    async update(patch) {
      patches.push(patch)
      current = mergeSettings(current, patch)
      return { settings: current, locked: [], fresh: false, file, rejected: [] }
    },
    onChange: () => () => undefined,
    file: () => file,
    onFile: () => () => undefined,
    openFile: async () => true,
  }
  const keymap = createKeymap(keyboard, () => current.shortcuts.keys)
  const view = createSettingsView(
    { overlay, body },
    {
      settings: client,
      api,
      i18n: createTranslator('en'),
      onClose: () => undefined,
      previewOpacity: () => undefined,
      keymap,
    },
  )
  view.open('shortcuts')
  close = () => view.close()
  const find = (selector: string) => {
    const found = body.querySelector<HTMLElement>(selector)
    if (!found) throw new Error(`invariant: ${selector} is on the page`)
    return found
  }
  const keyButton = (id: string) => find(`[data-focus="set-key-${id}"]`)
  const row = (id: string) => find(`[data-setting="shortcuts.keys.${id}"]`)
  return { body, view, patches, keymap, find, keyButton, row, current: () => current }
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('shortcuts page, recording an action key', () => {
  it('should list every action with its keycaps as a button when the page opens', () => {
    // Arrange
    const { body } = openShortcuts()

    // Act
    const buttons = [...body.querySelectorAll<HTMLElement>('button.skey')]

    // Assert
    expect(buttons).toHaveLength(20)
    expect(buttons[0]?.textContent).toBe('Ctrl+Shift+T')
    expect(buttons[0]?.getAttribute('aria-labelledby')).toBe(
      'set-label-shortcuts-keys-newTab set-key-newTab',
    )
  })

  it('should wait for a key in place and keep the shortcuts quiet when the keycaps are clicked', () => {
    // Arrange
    const { keyButton } = openShortcuts()

    // Act
    keyButton('newTab').click()

    // Assert
    expect(keyButton('newTab').textContent).toBe('Press the new key (Esc cancels)')
    expect(keyButton('newTab').dataset.recording).toBe('true')
    expect(inputGate.blocked).toBe(true)
  })

  it('should save the chord, show it and give the reset when a free chord is pressed', async () => {
    // Arrange
    const { keyButton, patches, find, current } = openShortcuts()
    keyButton('newTab').click()

    // Act
    press('n', { code: 'KeyN', ctrlKey: true, altKey: true })
    await settle()

    // Assert
    expect(patches).toEqual([{ shortcuts: { keys: { newTab: 'Ctrl+Alt+N' } } }])
    expect(current().shortcuts.keys).toEqual({ newTab: 'Ctrl+Alt+N' })
    expect(keyButton('newTab').textContent).toBe('Ctrl+Alt+N')
    expect(find('.sreset[data-key="shortcuts.keys.newTab"]').hidden).toBe(false)
    expect(inputGate.blocked).toBe(false)
  })

  it('should keep waiting and say why when a letter comes with no modifier', () => {
    // Arrange
    const { keyButton, row, patches } = openShortcuts()
    keyButton('theme').click()

    // Act
    press('j', { code: 'KeyJ' })

    // Assert
    expect(row('theme').querySelector('.serror')?.textContent).toBe(
      'Use Ctrl or Alt with that key.',
    )
    expect(keyButton('theme').dataset.recording).toBe('true')
    expect(patches).toEqual([])
  })

  it('should put the keys back and save nothing when Esc is pressed while recording', () => {
    // Arrange
    const { keyButton, patches, view } = openShortcuts()
    keyButton('theme').click()

    // Act
    press('Escape', { code: 'Escape' })

    // Assert
    expect(keyButton('theme').textContent).toBe('Ctrl+Shift+L')
    expect(patches).toEqual([])
    expect(view.isOpen()).toBe(true)
  })

  it('should stop recording and let the click go on when another control is clicked', () => {
    // Arrange
    const { keyButton } = openShortcuts()
    keyButton('theme').click()

    // Act
    keyButton('panel').click()

    // Assert
    expect(keyButton('theme').dataset.recording).toBeUndefined()
    expect(keyButton('panel').dataset.recording).toBe('true')
  })

  it('should allow a chord the shell uses and say the terminal loses it when it is saved', async () => {
    // Arrange
    const { keyButton, row } = openShortcuts()
    keyButton('renameTab').click()

    // Act
    press('r', { code: 'KeyR', ctrlKey: true })
    await settle()

    // Assert
    expect(row('renameTab').querySelector('.snote')?.textContent).toBe(
      'Ctrl+R no longer reaches the terminal.',
    )
  })

  it('should say so in the Mac symbols when a Control chord is saved on a Mac keyboard', async () => {
    // Arrange
    const { keyButton, row } = openShortcuts(defaultSettings, 'mac')
    keyButton('theme').click()

    // Act
    press('L', { code: 'KeyL', ctrlKey: true, shiftKey: true })
    await settle()

    // Assert
    expect(row('theme').querySelector('.snote')?.textContent).toBe(
      '⌃⇧L no longer reaches the terminal.',
    )
  })
})

describe('shortcuts page, a key another slot holds', () => {
  it('should hold the chord back with Swap and Cancel and save nothing when another action has it', () => {
    // Arrange
    const { keyButton, row, patches, find } = openShortcuts()
    keyButton('newTab').click()

    // Act
    press('W', { code: 'KeyW', ctrlKey: true, shiftKey: true })

    // Assert
    expect(row('newTab').querySelector('.snote')?.textContent).toBe('Already used by Close tab')
    expect(find('[data-focus="set-key-swap"]').textContent).toBe('Swap')
    expect(document.activeElement).toBe(find('[data-focus="set-key-swap"]'))
    expect(patches).toEqual([])
  })

  it('should give the other action the previous chord when Swap is clicked', async () => {
    // Arrange
    const { keyButton, find, current } = openShortcuts()
    keyButton('newTab').click()
    press('W', { code: 'KeyW', ctrlKey: true, shiftKey: true })

    // Act
    find('[data-focus="set-key-swap"]').click()
    await settle()

    // Assert
    expect(current().shortcuts.keys).toEqual({ newTab: 'Ctrl+Shift+W', closeTab: 'Ctrl+Shift+T' })
    expect(keyButton('newTab').textContent).toBe('Ctrl+Shift+W')
    expect(keyButton('closeTab').textContent).toBe('Ctrl+Shift+T')
  })

  it('should drop the held chord and keep the screen open when Esc is pressed', () => {
    // Arrange
    const { body, keyButton, view, patches } = openShortcuts()
    keyButton('newTab').click()
    press('W', { code: 'KeyW', ctrlKey: true, shiftKey: true })

    // Act
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    // Assert
    expect(view.isOpen()).toBe(true)
    expect(keyButton('newTab').textContent).toBe('Ctrl+Shift+T')
    expect(document.activeElement).toBe(keyButton('newTab'))
    expect(patches).toEqual([])
  })

  it('should name the global key when the chord recorded is the one that shows the window', () => {
    // Arrange
    const { keyButton, row } = openShortcuts()
    keyButton('fullHeight').click()

    // Act
    press('F12', { code: 'F12' })

    // Assert
    expect(row('fullHeight').querySelector('.snote')?.textContent).toBe(
      'Already used by Show and hide the window',
    )
  })
})

describe('shortcuts page, defaults and the file', () => {
  it('should give the action its default keys back when its reset is clicked', async () => {
    // Arrange
    const custom = mergeSettings(defaultSettings, { shortcuts: { keys: { nextTab: 'F6' } } })
    const { find, keyButton, current } = openShortcuts(custom)

    // Act
    find('.sreset[data-key="shortcuts.keys.nextTab"]').click()
    await settle()

    // Assert
    expect(current().shortcuts.keys).toEqual({})
    expect(keyButton('nextTab').textContent).toBe('Ctrl+Tab')
  })

  it('should remove every custom key when all defaults are restored', async () => {
    // Arrange
    const custom = mergeSettings(defaultSettings, {
      shortcuts: { keys: { nextTab: 'F6', theme: 'F8' } },
    })
    const { body, current } = openShortcuts(custom)
    body.querySelector<HTMLElement>('#settings-tab-system')?.click()
    const resetAll = () => body.querySelector<HTMLElement>('.sreset-all')

    // Act
    resetAll()?.click()
    resetAll()?.click()
    await settle()

    // Assert
    expect(current().shortcuts.keys).toEqual({})
  })

  it('should tell under the row what the file holds when a custom key is not valid', () => {
    // Arrange
    const file: SettingsFileState = {
      kind: 'ok',
      issues: [{ key: 'shortcuts.keys.theme', kind: 'dropped', found: '"Ctrl+"' }],
    }

    // Act
    const { row, find } = openShortcuts(defaultSettings, 'pc', file)

    // Assert
    expect(row('theme').querySelector('.snote')?.textContent).toBe(
      'In settings.json: "Ctrl+". Not valid, left out.',
    )
    expect(find('.sreset[data-key="shortcuts.keys.theme"]').hidden).toBe(false)
    expect(find('#settings-tab-shortcuts .snav-mark')).not.toBeNull()
  })
})

const mouse = (type: string, button: number, target: EventTarget = document.body) => {
  const event = new MouseEvent(type, { button, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('shortcuts page, the hold menu trigger', () => {
  it('should show the keyboard own key as a cap with Change beside it when none was chosen', () => {
    // Arrange and Act
    const { find } = openShortcuts()

    // Assert
    const row = find('[data-setting="shortcuts.holdTrigger"]')
    expect(row.querySelector('.key')?.textContent).toBe('Right Ctrl')
    expect(find('[data-focus="set-hold"]').textContent).toBe('Change')
  })

  it('should save a key that types nothing when it is pressed while recording', async () => {
    // Arrange
    const { find, current } = openShortcuts()
    find('[data-focus="set-hold"]').click()

    // Act
    press('F13', { code: 'F13' })
    await settle()

    // Assert
    expect(current().shortcuts.holdTrigger).toBe('F13')
    expect(find('[data-setting="shortcuts.holdTrigger"] .key').textContent).toBe('F13')
  })

  it('should refuse a key the terminal needs and keep recording when a letter is pressed', () => {
    // Arrange
    const { find, patches } = openShortcuts()
    find('[data-focus="set-hold"]').click()

    // Act
    press('q', { code: 'KeyQ' })

    // Assert
    expect(find('[data-setting="shortcuts.holdTrigger"] .serror').textContent).toBe(
      'The terminal needs that key.',
    )
    expect(find('[data-focus="set-hold"]').textContent).toBe('Press a key or button (Esc cancels)')
    expect(patches).toEqual([])
  })

  it('should drop the refusal when a key that fits is pressed after it', async () => {
    // Arrange
    const { find, body } = openShortcuts()
    find('[data-focus="set-hold"]').click()
    press('q', { code: 'KeyQ' })

    // Act
    press('Pause', { code: 'Pause' })
    await settle()

    // Assert
    expect(body.querySelector('[data-setting="shortcuts.holdTrigger"] .serror')).toBeNull()
    expect(find('[data-setting="shortcuts.holdTrigger"] .key').textContent).toBe('Pause')
  })

  it('should save the middle button by its name and keep its click from the page when it is pressed', async () => {
    // Arrange
    const { find, current } = openShortcuts()
    find('[data-focus="set-hold"]').click()

    // Act
    const down = mouse('mousedown', 1)
    const up = mouse('mouseup', 1)
    await settle()

    // Assert
    expect(current().shortcuts.holdTrigger).toBe('Mouse1')
    expect(find('[data-setting="shortcuts.holdTrigger"] .sbutton-name').textContent).toBe(
      'Middle button',
    )
    expect([down.defaultPrevented, up.defaultPrevented]).toEqual([true, true])
  })

  it('should refuse the left button on the recorder and keep recording when it is clicked', () => {
    // Arrange
    const { find, patches } = openShortcuts()
    const recorder = () => find('[data-focus="set-hold"]')
    recorder().click()

    // Act
    mouse('mousedown', 0, recorder())
    recorder().click()

    // Assert
    expect(find('[data-setting="shortcuts.holdTrigger"] .serror').textContent).toBe(
      'Use the middle, back or forward button.',
    )
    expect(recorder().dataset.recording).toBe('true')
    expect(patches).toEqual([])
  })

  it('should offer to swap with the action that has the key when an F key is recorded', async () => {
    // Arrange
    const custom = mergeSettings(defaultSettings, { shortcuts: { holdTrigger: 'F13' } })
    const { find, current } = openShortcuts(custom)
    find('[data-focus="set-hold"]').click()
    press('F11', { code: 'F11' })

    // Act
    const note = find('[data-setting="shortcuts.holdTrigger"] .snote').textContent
    find('[data-focus="set-key-swap"]').click()
    await settle()

    // Assert
    expect(note).toBe('Already used by Full height')
    expect(current().shortcuts).toMatchObject({ holdTrigger: 'F11', keys: { fullHeight: 'F13' } })
  })
})
