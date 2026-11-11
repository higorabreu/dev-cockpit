import { describe, expect, it } from 'vitest'
import { acceleratorFromEvent } from './accelerator.ts'
import { changedKeys, defaultSettings, mergeSettings, parseSettings } from './settings.ts'

describe('parseSettings', () => {
  it('should return the defaults when there is nothing to read', () => {
    expect(parseSettings(undefined)).toEqual(defaultSettings)
    expect(parseSettings(null)).toEqual(defaultSettings)
    expect(parseSettings('oops')).toEqual(defaultSettings)
    expect(parseSettings([])).toEqual(defaultSettings)
  })

  it('should use the documented defaults when the file is empty', () => {
    expect(defaultSettings).toEqual({
      language: 'auto',
      theme: 'dark',
      opacity: 0.92,
      fontSize: 16,
      window: { heightRatio: 0.5, panelOnFullHeight: true },
      shortcuts: { toggleWindow: 'F12', holdTrigger: 'ControlRight' },
      projects: { root: null, depth: 2 },
      system: { notifyAfterSeconds: 30 },
    })
  })

  it('should keep the valid fields and reset only the invalid one when a field has the wrong type', () => {
    const settings = parseSettings({ language: 'en', theme: 42, opacity: 'x', fontSize: 20 })

    expect(settings).toMatchObject({ language: 'en', theme: 'dark', opacity: 0.92, fontSize: 20 })
  })

  it('should cut numbers at the limits when they are out of range', () => {
    const settings = parseSettings({ opacity: 5, fontSize: 2, window: { heightRatio: -1 } })

    expect(settings.opacity).toBe(1)
    expect(settings.fontSize).toBe(10)
    expect(settings.window.heightRatio).toBe(0.3)
  })

  it('should round whole number fields when they have decimals', () => {
    expect(parseSettings({ fontSize: 15.6 }).fontSize).toBe(16)
  })

  it('should fall back to the defaults when a section is not an object', () => {
    const settings = parseSettings({ window: 'big', shortcuts: [] })

    expect(settings.window).toEqual(defaultSettings.window)
    expect(settings.shortcuts).toEqual(defaultSettings.shortcuts)
  })

  it('should keep a chosen projects root and drop an empty one when reading', () => {
    expect(parseSettings({ projects: { root: '/work' } }).projects.root).toBe('/work')
    expect(parseSettings({ projects: { root: '   ' } }).projects.root).toBeNull()
  })

  it('should ignore unknown fields when reading', () => {
    expect(parseSettings({ surprise: true })).toEqual(defaultSettings)
  })

  it('should accept only the known hold triggers when reading', () => {
    expect(parseSettings({ shortcuts: { holdTrigger: 'AltRight' } }).shortcuts.holdTrigger).toBe(
      'AltRight',
    )
    expect(parseSettings({ shortcuts: { holdTrigger: 'KeyQ' } }).shortcuts.holdTrigger).toBe(
      'ControlRight',
    )
  })
})

describe('mergeSettings', () => {
  it('should change only the given field and keep the rest when merging a patch', () => {
    const merged = mergeSettings(defaultSettings, { window: { heightRatio: 0.7 } })

    expect(merged.window).toEqual({ heightRatio: 0.7, panelOnFullHeight: true })
    expect(merged.theme).toBe('dark')
  })

  it('should clamp a patched value when it is out of range', () => {
    expect(mergeSettings(defaultSettings, { opacity: 0.1 }).opacity).toBe(0.3)
  })

  it('should allow clearing the projects root when merging null', () => {
    const withRoot = mergeSettings(defaultSettings, { projects: { root: '/work' } })

    expect(mergeSettings(withRoot, { projects: { root: null } }).projects.root).toBeNull()
  })

  it('should not change the current settings object when merging', () => {
    const before = structuredClone(defaultSettings)

    mergeSettings(defaultSettings, { theme: 'light' })

    expect(defaultSettings).toEqual(before)
  })
})

describe('changedKeys', () => {
  it('should list the dotted keys that differ between two settings', () => {
    const after = mergeSettings(defaultSettings, { theme: 'light', window: { heightRatio: 0.8 } })

    expect([...changedKeys(defaultSettings, after)].sort()).toEqual(['theme', 'window.heightRatio'])
  })

  it('should list nothing when the settings are the same', () => {
    expect(changedKeys(defaultSettings, parseSettings({}))).toEqual([])
  })
})

const press = (
  key: string,
  modifiers: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {},
) =>
  acceleratorFromEvent({
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...modifiers,
  })

describe('acceleratorFromEvent', () => {
  it('should accept a function key alone when it is pressed', () => {
    expect(press('F12')).toEqual({ type: 'accelerator', value: 'F12' })
  })

  it('should join the modifiers in a fixed order when several are held', () => {
    expect(press(' ', { shiftKey: true, ctrlKey: true, altKey: true })).toEqual({
      type: 'accelerator',
      value: 'Ctrl+Alt+Shift+Space',
    })
  })

  it('should uppercase letters and require a modifier when a letter is pressed', () => {
    expect(press('k', { ctrlKey: true })).toEqual({ type: 'accelerator', value: 'Ctrl+K' })
    expect(press('k')).toEqual({ type: 'invalid', reason: 'needsModifier' })
  })

  it('should wait when only modifiers are held', () => {
    expect(press('Control', { ctrlKey: true })).toEqual({ type: 'pending' })
    expect(press('Shift', { shiftKey: true })).toEqual({ type: 'pending' })
  })

  it('should cancel when escape is pressed', () => {
    expect(press('Escape')).toEqual({ type: 'cancel' })
  })

  it('should name the arrow keys the way the system expects', () => {
    expect(press('ArrowUp', { altKey: true })).toEqual({ type: 'accelerator', value: 'Alt+Up' })
  })

  it('should refuse keys that cannot be a global shortcut', () => {
    expect(press('Dead', { ctrlKey: true })).toEqual({ type: 'invalid', reason: 'unsupported' })
  })

  it('should call the windows key Super when it is held', () => {
    expect(press('d', { metaKey: true })).toEqual({ type: 'accelerator', value: 'Super+D' })
  })
})
