// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { gesture, keyChords, keys, MOUSE_LEFT } from './keys.ts'

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

describe('gesture', () => {
  const open = { click: 'left click', action: 'Open' }
  const capsOf = (hint: HTMLElement) =>
    [...hint.querySelectorAll('kbd.key')].map((cap) =>
      cap.classList.contains('mouse') ? 'mouse' : cap.textContent,
    )

  it('should draw the key and a mouse as caps and the action as a word when the key is held for a click', () => {
    // Arrange
    const hint = gesture('Ctrl', { click: 'clique', action: 'Abrir' })

    // Act
    const caps = capsOf(hint)

    // Assert
    expect(caps).toEqual(['Ctrl', 'mouse'])
    expect(hint.querySelector('.kplus')?.textContent).toBe('+')
    expect(hint.querySelector('.gesture-action')?.lastChild?.textContent).toBe('Abrir')
  })

  it('should draw the mouse with its left button filled and hide the drawing from a screen reader', () => {
    // Arrange
    const mouse = gesture('Ctrl', open).querySelector('kbd.mouse')

    // Act
    const svg = mouse?.querySelector('svg')

    // Assert
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.querySelector('[fill="currentColor"]')).not.toBeNull()
  })

  it('should read as a sentence when a screen reader takes the text on a PC', () => {
    expect(gesture('Ctrl', open).textContent).toBe('Ctrl+left click, Open')
  })

  it('should join the mouse to the Mac symbol with no + when the keyboard is a Mac', () => {
    // Arrange
    const hint = gesture('⌘', open)

    // Act
    const text = hint.textContent

    // Assert
    expect(capsOf(hint)).toEqual(['⌘', 'mouse'])
    expect(hint.querySelector('.kplus')).toBeNull()
    expect(text).toBe('⌘ left click, Open')
  })

  it('should escape the action and the click name when they hold markup', () => {
    const hint = gesture('Ctrl', { click: '<i>x</i>', action: '<b>open</b>' })
    expect(hint.querySelector('b, i')).toBeNull()
  })
})

describe('keys with the mouse', () => {
  it('should draw the mouse as a cap when a chord names the left button', () => {
    expect(keys(`Ctrl+${MOUSE_LEFT}`).querySelectorAll('kbd.mouse')).toHaveLength(1)
  })
})
