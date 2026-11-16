// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { keyChords, keys } from './keys.ts'

const capsOf = (label: string) => keyChords(label).map((chord) => chord.keys)

describe('keyChords', () => {
  it('should give each key of a PC chord its own cap when the label joins them with +', () => {
    expect(keyChords('Ctrl+Shift+D')).toEqual([{ keys: ['Ctrl', 'Shift', 'D'], joiner: '+' }])
  })

  it('should split the Mac modifiers into caps with nothing between them when the label is in symbols', () => {
    expect(keyChords('⇧⌘D')).toEqual([{ keys: ['⇧', '⌘', 'D'], joiner: '' }])
    expect(capsOf('⌃⌘F')).toEqual([['⌃', '⌘', 'F']])
    expect(capsOf('⌃Tab')).toEqual([['⌃', 'Tab']])
  })

  it('should keep a trailing + as the key itself when the chord is Ctrl++', () => {
    expect(capsOf('Ctrl++')).toEqual([['Ctrl', '+']])
  })

  it('should separate chords and alternatives when the label has spaces', () => {
    expect(capsOf('n p')).toEqual([['n'], ['p']])
    expect(capsOf('Ctrl+Shift+↑ ↓')).toEqual([['Ctrl', 'Shift', '↑'], ['↓']])
    expect(capsOf('Ctrl+= − 0')).toEqual([['Ctrl', '='], ['−'], ['0']])
  })

  it('should keep a single key and a key that is a pair of glyphs as one cap', () => {
    expect(capsOf('F12')).toEqual([['F12']])
    expect(capsOf('↑↓')).toEqual([['↑↓']])
  })
})

describe('keys', () => {
  it('should read as the label when its text is taken, for a screen reader or a copy', () => {
    expect(keys('Ctrl+Shift+D').textContent).toBe('Ctrl+Shift+D')
    expect(keys('⇧⌘D').textContent).toBe('⇧⌘D')
    expect(keys('n p').textContent).toBe('n p')
  })

  it('should draw one cap per key when the label is a chord', () => {
    expect(keys('Ctrl+Shift+D', 'compact').querySelectorAll('kbd.key')).toHaveLength(3)
  })

  it('should escape the label when it holds markup', () => {
    expect(keys('<b>').querySelector('b')).toBeNull()
  })
})
