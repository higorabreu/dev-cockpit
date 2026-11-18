import { describe, expect, it } from 'vitest'
import { type CustomKeys, createKeymap, type Keyboard } from '../platform/keymap.ts'
import { type KeySlots, place } from './key-slots.ts'

function slotsWith(
  custom: CustomKeys = {},
  more: Partial<Omit<KeySlots, 'keymap'>> = {},
  keyboard: Keyboard = 'pc',
): KeySlots {
  const keymap = createKeymap(keyboard, () => custom)
  return { keymap, toggleWindow: 'F12', holdTrigger: keymap.holdTrigger, ...more }
}

describe('place', () => {
  it('should save the chord as the file writes it when no other slot holds it', () => {
    const placement = place(slotsWith(), 'newTab', {
      kind: 'chord',
      chord: { key: 'n', ctrl: true, alt: true },
    })

    expect(placement).toEqual({
      kind: 'save',
      patch: { shortcuts: { keys: { newTab: 'Ctrl+Alt+N' } } },
    })
  })

  it('should save no choice when the chord is one of the action defaults', () => {
    const placement = place(slotsWith({ nextTab: 'F6' }), 'nextTab', {
      kind: 'chord',
      chord: { key: 'PageDown', ctrl: true },
    })

    expect(placement).toEqual({ kind: 'save', patch: { shortcuts: { keys: { nextTab: null } } } })
  })

  it('should change nothing when the slot already answers to the chord', () => {
    const placement = place(slotsWith(), 'nextTab', {
      kind: 'chord',
      chord: { key: 'PageDown', ctrl: true },
    })

    expect(placement).toEqual({ kind: 'same' })
  })

  it('should name the owner and swap the previous chord when another action holds it', () => {
    const placement = place(slotsWith(), 'newTab', {
      kind: 'chord',
      chord: { key: 'w', ctrl: true, shift: true },
    })

    expect(placement).toEqual({
      kind: 'conflict',
      owner: 'closeTab',
      swap: { shortcuts: { keys: { newTab: 'Ctrl+Shift+W', closeTab: 'Ctrl+Shift+T' } } },
    })
  })

  it('should give the global key the action previous chord when the swap is with it', () => {
    const placement = place(slotsWith(), 'fullHeight', { kind: 'chord', chord: { key: 'F12' } })

    expect(placement).toEqual({
      kind: 'conflict',
      owner: 'toggleWindow',
      swap: { shortcuts: { keys: { fullHeight: 'F12' }, toggleWindow: 'F11' } },
    })
  })

  it('should offer no swap when the owner is the trigger and the previous chord has modifiers', () => {
    const placement = place(slotsWith({}, { holdTrigger: 'F13' }), 'theme', {
      kind: 'chord',
      chord: { key: 'F13' },
    })

    expect(placement).toEqual({ kind: 'conflict', owner: 'holdTrigger' })
  })

  it('should swap the trigger with an action when both are keys with no modifier', () => {
    const placement = place(slotsWith({}, { holdTrigger: 'F13' }), 'holdTrigger', {
      kind: 'trigger',
      code: 'F11',
    })

    expect(placement).toEqual({
      kind: 'conflict',
      owner: 'fullHeight',
      swap: { shortcuts: { holdTrigger: 'F11', keys: { fullHeight: 'F13' } } },
    })
  })

  it('should save no choice when the trigger recorded is the keyboard own one', () => {
    const placement = place(slotsWith({}, { holdTrigger: 'AltRight' }), 'holdTrigger', {
      kind: 'trigger',
      code: 'ControlRight',
    })

    expect(placement).toEqual({ kind: 'save', patch: { shortcuts: { holdTrigger: null } } })
  })

  it('should never find a conflict when the trigger is a mouse button', () => {
    const placement = place(slotsWith(), 'holdTrigger', { kind: 'trigger', code: 'Mouse1' })

    expect(placement).toEqual({ kind: 'save', patch: { shortcuts: { holdTrigger: 'Mouse1' } } })
  })

  it('should find the action that holds the global key recorded when it is the same chord', () => {
    const placement = place(slotsWith(), 'toggleWindow', {
      kind: 'accelerator',
      text: 'Ctrl+Shift+L',
    })

    expect(placement).toEqual({
      kind: 'conflict',
      owner: 'theme',
      swap: { shortcuts: { toggleWindow: 'Ctrl+Shift+L', keys: { theme: 'F12' } } },
    })
  })

  it('should write the Mac names when the keyboard is a Mac one', () => {
    const placement = place(slotsWith({}, {}, 'mac'), 'theme', {
      kind: 'chord',
      chord: { key: 'j', meta: true, alt: true },
    })

    expect(placement).toEqual({
      kind: 'save',
      patch: { shortcuts: { keys: { theme: 'Option+Cmd+J' } } },
    })
  })
})
