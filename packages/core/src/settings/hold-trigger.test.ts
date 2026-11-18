import { describe, expect, it } from 'vitest'
import {
  chordTrigger,
  holdTriggerProblem,
  isHoldTrigger,
  mouseTrigger,
  triggerButton,
  triggerChord,
} from './hold-trigger.ts'

describe('holdTriggerProblem', () => {
  it('should accept a key that types nothing when it is a modifier, an F key or a lock key', () => {
    for (const code of [
      'ControlRight',
      'ShiftLeft',
      'MetaLeft',
      'F13',
      'CapsLock',
      'ScrollLock',
      'Pause',
      'Insert',
      'ContextMenu',
      'NumLock',
    ])
      expect(holdTriggerProblem(code)).toBeUndefined()
  })

  it('should refuse a key the terminal needs when it types, moves or answers', () => {
    for (const code of [
      'KeyQ',
      'Digit1',
      'Space',
      'Enter',
      'NumpadEnter',
      'Tab',
      'Escape',
      'Backspace',
      'ArrowUp',
      'Home',
      'Comma',
      'IntlBackslash',
    ])
      expect(holdTriggerProblem(code)).toBe('terminalKey')
  })

  it('should take only the middle, back and forward buttons when the trigger is a mouse button', () => {
    expect(['Mouse1', 'Mouse3', 'Mouse4'].every(isHoldTrigger)).toBe(true)
    expect(holdTriggerProblem('Mouse0')).toBe('mainButton')
    expect(holdTriggerProblem('Mouse2')).toBe('mainButton')
  })

  it('should refuse a code no key reports when the text is not a code', () => {
    expect(holdTriggerProblem('')).toBe('unknown')
    expect(holdTriggerProblem('Unidentified')).toBe('unknown')
    expect(holdTriggerProblem('right ctrl')).toBe('unknown')
  })
})

describe('mouse triggers', () => {
  it('should name a button and read it back when going both ways', () => {
    expect(mouseTrigger(1)).toBe('Mouse1')
    expect(triggerButton('Mouse4')).toBe(4)
    expect(triggerButton('ControlRight')).toBeUndefined()
  })
})

describe('triggerChord and chordTrigger', () => {
  it('should see the same key when an F key is both the trigger and a chord with no modifier', () => {
    expect(triggerChord('F13')).toEqual({ key: 'F13' })
    expect(chordTrigger({ key: 'F13' })).toBe('F13')
  })

  it('should find no chord or trigger when the key is a modifier or the chord holds one', () => {
    expect(triggerChord('ControlRight')).toBeUndefined()
    expect(chordTrigger({ key: 'F13', ctrl: true })).toBeUndefined()
  })
})
