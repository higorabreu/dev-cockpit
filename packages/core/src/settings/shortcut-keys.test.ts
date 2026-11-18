import { describe, expect, it } from 'vitest'
import type { KeyInput } from './accelerator.ts'
import {
  chordFromEvent,
  chordProblem,
  formatChord,
  isShellChord,
  matchesChord,
  parseChord,
  sameChord,
} from './shortcut-keys.ts'

const press = (key: string, modifiers: Partial<KeyInput> = {}): KeyInput => ({
  key,
  code: '',
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
})

describe('parseChord', () => {
  it('should read the modifiers and the key when the text is written as the file keeps it', () => {
    expect(parseChord('Ctrl+Shift+T')).toEqual({ key: 't', ctrl: true, shift: true })
  })

  it('should read the Mac names and any case when the text was written by hand', () => {
    expect(parseChord('cmd+option+k')).toEqual({ key: 'k', meta: true, alt: true })
    expect(parseChord('Command+Shift+Enter')).toEqual({ key: 'Enter', meta: true, shift: true })
  })

  it('should read named keys in either spelling when the key is not a character', () => {
    expect(parseChord('Ctrl+Shift+Up')).toEqual({ key: 'ArrowUp', ctrl: true, shift: true })
    expect(parseChord('Ctrl+ArrowDown')).toEqual({ key: 'ArrowDown', ctrl: true })
    expect(parseChord('Alt+Space')).toEqual({ key: ' ', alt: true })
    expect(parseChord('f11')).toEqual({ key: 'F11' })
  })

  it('should read the plus as the key when it comes last', () => {
    expect(parseChord('Ctrl++')).toEqual({ key: '+', ctrl: true })
    expect(parseChord('Ctrl+Plus')).toEqual({ key: '+', ctrl: true })
  })

  it('should refuse the text when a typing key has no modifier but Shift', () => {
    expect(parseChord('T')).toBeUndefined()
    expect(parseChord('Shift+T')).toBeUndefined()
    expect(parseChord('Tab')).toBeUndefined()
  })

  it('should refuse the text when a name is unknown, repeated or missing', () => {
    expect(parseChord('Hyper+T')).toBeUndefined()
    expect(parseChord('Ctrl+Ctrl+T')).toBeUndefined()
    expect(parseChord('Ctrl+')).toBeUndefined()
    expect(parseChord('Ctrl+Escape')).toBeUndefined()
    expect(parseChord('')).toBeUndefined()
  })

  it('should accept a key that types nothing when it is alone', () => {
    expect(parseChord('Pause')).toEqual({ key: 'Pause' })
    expect(parseChord('Menu')).toEqual({ key: 'ContextMenu' })
  })
})

describe('formatChord', () => {
  it('should write the PC names when the keyboard is a PC', () => {
    const chord = { key: 'ArrowUp', ctrl: true, alt: true, shift: true, meta: true }

    expect(formatChord(chord, 'pc')).toBe('Ctrl+Alt+Shift+Super+Up')
  })

  it('should write the Mac names when the keyboard is a Mac', () => {
    expect(formatChord({ key: 'k', alt: true, meta: true }, 'mac')).toBe('Option+Cmd+K')
  })

  it('should read back the same chord when its text is parsed', () => {
    for (const chord of [
      { key: '+', ctrl: true },
      { key: ' ', alt: true },
      { key: ',', meta: true },
      { key: 'F13' },
    ]) {
      const text = formatChord(chord, 'mac')

      expect(parseChord(text)).toEqual(chord)
    }
  })
})

describe('chordFromEvent', () => {
  it('should wait when only a modifier is down', () => {
    expect(chordFromEvent(press('Control', { ctrlKey: true }))).toEqual({ type: 'pending' })
  })

  it('should cancel when Esc is pressed', () => {
    expect(chordFromEvent(press('Escape'))).toEqual({ type: 'cancel' })
  })

  it('should give the chord with a lowercase letter when a letter is pressed with modifiers', () => {
    const result = chordFromEvent(press('T', { ctrlKey: true, shiftKey: true }))

    expect(result).toEqual({ type: 'chord', chord: { key: 't', ctrl: true, shift: true } })
  })

  it('should take the physical key when Option changes the character', () => {
    const result = chordFromEvent(press('¡', { code: 'Digit1', altKey: true }))

    expect(result).toEqual({ type: 'chord', chord: { key: '1', alt: true } })
  })

  it('should ask for a modifier when a typing key is pressed alone or with Shift', () => {
    expect(chordFromEvent(press('a'))).toEqual({ type: 'invalid', reason: 'needsModifier' })
    expect(chordFromEvent(press('A', { shiftKey: true }))).toEqual({
      type: 'invalid',
      reason: 'needsModifier',
    })
  })

  it('should take an F key when it is pressed alone', () => {
    expect(chordFromEvent(press('F9'))).toEqual({ type: 'chord', chord: { key: 'F9' } })
  })

  it('should refuse a key with no name when the layout gives none', () => {
    expect(chordFromEvent(press('Dead', { ctrlKey: true }))).toEqual({
      type: 'invalid',
      reason: 'unsupported',
    })
  })
})

describe('matchesChord', () => {
  it('should match only the exact modifiers when the chord has none of shift', () => {
    const chord = { key: 't', ctrl: true }

    expect(matchesChord(press('t', { ctrlKey: true }), chord)).toBe(true)
    expect(matchesChord(press('T', { ctrlKey: true, shiftKey: true }), chord)).toBe(false)
  })
})

describe('sameChord', () => {
  it('should treat a missing modifier as not held when comparing', () => {
    expect(sameChord({ key: 'k', ctrl: true, shift: false }, { key: 'k', ctrl: true })).toBe(true)
    expect(sameChord({ key: 'k', ctrl: true }, { key: 'k', meta: true })).toBe(false)
  })
})

describe('isShellChord', () => {
  it('should flag Ctrl and a character on a PC when nothing else is held', () => {
    expect(isShellChord({ key: 'r', ctrl: true }, 'pc')).toBe(true)
    expect(isShellChord({ key: '/', ctrl: true }, 'pc')).toBe(true)
  })

  it('should leave the cockpit chords alone on a PC when Shift, Alt or a named key is in them', () => {
    expect(isShellChord({ key: 'r', ctrl: true, shift: true }, 'pc')).toBe(false)
    expect(isShellChord({ key: 'r', ctrl: true, alt: true }, 'pc')).toBe(false)
    expect(isShellChord({ key: 'Tab', ctrl: true }, 'pc')).toBe(false)
  })

  it('should flag any Control chord without Cmd when the keyboard is a Mac', () => {
    expect(isShellChord({ key: 'r', ctrl: true, shift: true }, 'mac')).toBe(true)
    expect(isShellChord({ key: 'f', ctrl: true, meta: true }, 'mac')).toBe(false)
  })
})

describe('chordProblem', () => {
  it('should accept a typing key when Alt or Cmd is held', () => {
    expect(chordProblem({ key: 'k', alt: true })).toBeUndefined()
    expect(chordProblem({ key: 'Enter', meta: true })).toBeUndefined()
  })
})
