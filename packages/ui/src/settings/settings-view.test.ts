// @vitest-environment happy-dom
import {
  createTranslator,
  defaultSettings,
  type HostApi,
  type Settings,
  type SettingsPatch,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import type { SettingsClient } from './settings-client.ts'
import { createSettingsView } from './settings-view.ts'

function fakeSettings(locked: readonly string[] = []) {
  let current: Settings = defaultSettings
  const patches: SettingsPatch[] = []
  const client: SettingsClient = {
    current: () => current,
    locked: () => locked,
    async update(patch) {
      patches.push(patch)
      current = { ...current, ...patch } as Settings
      return { settings: current, locked, fresh: false, rejected: [] }
    },
    onChange: () => () => undefined,
  }
  return { client, patches }
}

// Only what opening the screen asks the host for
const api = {
  connections: { gitlab: { status: async () => ({ kind: 'none' }) } },
  autostart: { isEnabled: async () => false },
} as unknown as HostApi

function open(locked: readonly string[] = []) {
  document.body.replaceChildren()
  const overlay = document.createElement('div')
  const body = document.createElement('div')
  overlay.append(body)
  document.body.append(overlay)
  const settings = fakeSettings(locked)
  let closed = false
  const view = createSettingsView(
    { overlay, body },
    {
      settings: settings.client,
      api,
      i18n: createTranslator('en'),
      onClose: () => {
        closed = true
      },
      previewOpacity: () => undefined,
    },
  )
  view.open()
  const combobox = (key: string) => {
    const found = body.querySelector<HTMLButtonElement>(`[data-focus="set-${key}"]`)
    if (!found) throw new Error(`invariant: ${key} has a control`)
    return found
  }
  return { view, body, combobox, patches: settings.patches, isClosed: () => closed }
}

const press = (target: HTMLElement, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('settings view selects', () => {
  it('should use the design system select for every choice when the screen is drawn', () => {
    const { body, view, combobox } = open()

    const general = [...body.querySelectorAll('[role="combobox"]')].map((element) =>
      element.getAttribute('data-focus'),
    )
    body.querySelector<HTMLElement>('#settings-tab-shortcuts')?.click()

    expect(body.querySelector('select')).toBeNull()
    expect(general).toEqual(['set-language', 'set-theme'])
    expect(combobox('shortcuts.holdTrigger').getAttribute('role')).toBe('combobox')
    view.close()
  })

  it('should name each select by its row label when the screen is drawn', () => {
    const { body, combobox, view } = open()

    const labelId = combobox('theme').getAttribute('aria-labelledby') ?? ''

    expect(body.querySelector(`#${labelId}`)?.textContent).toBe('Theme')
    view.close()
  })

  it('should save the picked value and keep it and the focus after the redraw when picked by keyboard', async () => {
    const { combobox, patches, view } = open()
    const theme = combobox('theme')
    theme.focus()

    press(theme, 'Enter')
    press(theme, 'ArrowDown')
    press(theme, 'Enter')
    await settle()
    view.rerender()

    expect(patches).toEqual([{ theme: 'light' }])
    expect(combobox('theme').querySelector('[data-current]')?.textContent).toBe('Light')
    expect(document.activeElement).toBe(combobox('theme'))
    view.close()
  })

  it('should close only the list and leave the screen open when Escape is pressed on an open select', () => {
    const { combobox, isClosed, view } = open()
    const language = combobox('language')
    language.focus()
    press(language, 'Enter')

    press(language, 'Escape')

    expect(language.getAttribute('aria-expanded')).toBe('false')
    expect(isClosed()).toBe(false)
    expect(view.isOpen()).toBe(true)
    view.close()
  })

  it('should disable the select of a row locked by the environment when the screen is drawn', () => {
    const { combobox, view } = open(['language'])

    const language = combobox('language')

    expect(language.disabled).toBe(true)
    expect(language.closest('[data-locked="true"]')).not.toBeNull()
    expect(combobox('theme').disabled).toBe(false)
    view.close()
  })
})
