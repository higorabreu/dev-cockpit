import type { KeyInput } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createKeymap, keyboardFor } from './keymap.ts'

const key = (value: string, init: Partial<KeyInput> = {}): KeyInput => ({
  key: value,
  code: '',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...init,
})

describe('createKeymap labels', () => {
  const pc = createKeymap('pc')
  const mac = createKeymap('mac')

  it.each([
    ['newTab', 'Ctrl+Shift+T', '⌘T'],
    ['closeTab', 'Ctrl+Shift+W', '⌘W'],
    ['renameTab', 'Ctrl+Shift+R', '⇧⌘R'],
    ['nextTab', 'Ctrl+Tab', '⌃Tab'],
    ['previousTab', 'Ctrl+Shift+Tab', '⌃⇧Tab'],
    ['settings', 'Ctrl+,', '⌘,'],
    ['review', 'Ctrl+Shift+D', '⇧⌘D'],
    ['reviewLayout', 'Ctrl+Shift+E', '⇧⌘E'],
    ['reviewSend', 'Ctrl+Shift+Enter', '⇧⌘Enter'],
    ['fullHeight', 'F11', '⌃⌘F'],
    ['opacityUp', 'Ctrl+Shift+↑', '⇧⌘↑'],
    ['clearTerminal', 'Ctrl+Shift+K', '⌘K'],
  ] as const)('should label %s as %s on a PC and %s on a Mac', (id, onPc, onMac) => {
    expect(pc.label(id)).toBe(onPc)
    expect(mac.label(id)).toBe(onMac)
  })

  it('should give the modifiers alone when a label lists several keys after them', () => {
    expect(pc.modifiers('fontBigger')).toBe('Ctrl')
    expect(mac.modifiers('fontBigger')).toBe('⌘')
  })

  it('should label a panel key with Ctrl on a PC and Cmd on a Mac', () => {
    expect(pc.commandLabel('r')).toBe('Ctrl+R')
    expect(mac.commandLabel('r')).toBe('⌘R')
  })
})

describe('createKeymap matches', () => {
  const pc = createKeymap('pc')
  const mac = createKeymap('mac')

  it('should open a tab with Ctrl+Shift+T when the keyboard is a PC one', () => {
    expect(pc.matches(key('T', { ctrlKey: true, shiftKey: true }), 'newTab')).toBe(true)
  })

  it('should open a tab with Cmd+T and leave Ctrl to the shell when the keyboard is a Mac one', () => {
    expect(mac.matches(key('t', { metaKey: true }), 'newTab')).toBe(true)
    expect(mac.matches(key('T', { ctrlKey: true, shiftKey: true }), 'newTab')).toBe(false)
  })

  it('should not match when an extra modifier is held', () => {
    expect(mac.matches(key('T', { metaKey: true, shiftKey: true }), 'newTab')).toBe(false)
  })

  it.each([']', '}'])(
    'should go to the next tab with Shift+Cmd and %s when the keyboard is a Mac one',
    (pressed) => {
      expect(mac.matches(key(pressed, { metaKey: true, shiftKey: true }), 'nextTab')).toBe(true)
    },
  )

  it('should take Ctrl+Cmd+F for the full height when the keyboard is a Mac one', () => {
    expect(mac.matches(key('f', { ctrlKey: true, metaKey: true }), 'fullHeight')).toBe(true)
    expect(mac.matches(key('F11'), 'fullHeight')).toBe(false)
  })

  it('should take a panel key with Cmd on a Mac and Ctrl on a PC', () => {
    expect(mac.command(key('d', { metaKey: true }), 'd')).toBe(true)
    expect(mac.command(key('d', { ctrlKey: true }), 'd')).toBe(false)
    expect(pc.command(key('d', { ctrlKey: true }), 'd')).toBe(true)
    expect(pc.command(key('D', { ctrlKey: true, shiftKey: true }), 'd')).toBe(false)
  })
})

describe('createKeymap tabIndex', () => {
  it('should go to the first tab with Cmd+1 when the keyboard is a Mac one', () => {
    expect(createKeymap('mac').tabIndex(key('1', { metaKey: true, code: 'Digit1' }))).toBe(0)
  })

  it('should leave Option+1 alone when the keyboard is a Mac one', () => {
    expect(createKeymap('mac').tabIndex(key('¡', { altKey: true, code: 'Digit1' }))).toBeUndefined()
  })

  it('should go to the eighth tab with Alt+8 when the keyboard is a PC one', () => {
    expect(createKeymap('pc').tabIndex(key('8', { altKey: true, code: 'Digit8' }))).toBe(7)
  })

  it('should go to the last tab with Alt+9 when the keyboard is a PC one', () => {
    expect(createKeymap('pc').tabIndex(key('9', { altKey: true, code: 'Digit9' }))).toBe('last')
  })

  it('should go to the last tab with Cmd+9 when the keyboard is a Mac one', () => {
    expect(createKeymap('mac').tabIndex(key('9', { metaKey: true, code: 'Digit9' }))).toBe('last')
  })

  it('should read the physical key when Option on a Mac keyboard turns 1 into another character', () => {
    expect(createKeymap('pc').tabIndex(key('¡', { altKey: true, code: 'Digit1' }))).toBe(0)
  })

  it('should read the digit from the physical key when the layout types a symbol there', () => {
    expect(createKeymap('pc').tabIndex(key('&', { altKey: true, code: 'Digit1' }))).toBe(0)
  })
})

describe('keyboardFor', () => {
  it('should be a Mac keyboard when the browser runs on a Mac', () => {
    expect(keyboardFor('MacIntel')).toBe('mac')
  })

  it.each(['Linux x86_64', 'Win32', ''])(
    'should be a PC keyboard when the platform is "%s"',
    (platform) => {
      expect(keyboardFor(platform)).toBe('pc')
    },
  )
})

describe('createKeymap per keyboard', () => {
  it('should open links with Cmd and hold the right Option when the keyboard is a Mac one', () => {
    // Act
    const mac = createKeymap('mac')

    // Assert
    expect([mac.click.modifier, mac.click.label, mac.holdTrigger]).toEqual([
      'meta',
      '⌘',
      'AltRight',
    ])
    expect(mac.click.isHeld({ ctrlKey: true, metaKey: false })).toBe(false)
  })

  it('should open links with Ctrl and hold the right Ctrl when the keyboard is a PC one', () => {
    // Act
    const pc = createKeymap('pc')

    // Assert
    expect([pc.click.modifier, pc.click.label, pc.holdTrigger]).toEqual([
      'ctrl',
      'Ctrl',
      'ControlRight',
    ])
    expect(pc.click.isHeld({ ctrlKey: true, metaKey: false })).toBe(true)
  })

  it('should copy and paste with Ctrl+Shift+C and V on a PC and leave them to the shell on a Mac', () => {
    // Arrange
    const copy = key('C', { ctrlKey: true, shiftKey: true })
    const paste = key('V', { ctrlKey: true, shiftKey: true })

    // Act
    const pc = createKeymap('pc')
    const mac = createKeymap('mac')

    // Assert
    expect([pc.clipboard(copy), pc.clipboard(paste)]).toEqual(['copy', 'paste'])
    expect([mac.clipboard(copy), mac.clipboard(paste)]).toEqual([undefined, undefined])
  })
})
