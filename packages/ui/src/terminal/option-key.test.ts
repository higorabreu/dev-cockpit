// @vitest-environment happy-dom
import type { Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'
import { attachOptionKeys, optionIsMeta, rightOptionHeld } from './option-key.ts'

describe('optionIsMeta', () => {
  it.each([
    ['left', false, true],
    ['left', true, false],
    ['both', false, true],
    ['both', true, true],
    ['none', false, false],
    ['none', true, false],
  ] as const)('should answer for %s with the right Option held %s as %s', (mode, held, meta) => {
    expect(optionIsMeta(mode, held)).toBe(meta)
  })
})

const event = (type: string, code: string, altKey: boolean) => ({ type, code, altKey })

describe('rightOptionHeld', () => {
  it('should hold the right Option from its keydown to its keyup', () => {
    // Act
    const down = rightOptionHeld(false, event('keydown', 'AltRight', true))
    const typing = rightOptionHeld(down, event('keydown', 'KeyE', true))
    const up = rightOptionHeld(typing, event('keyup', 'AltRight', false))

    // Assert
    expect([down, typing, up]).toEqual([true, true, false])
  })

  it('should take the right Option as released when a key arrives with no Option held', () => {
    expect(rightOptionHeld(true, event('keydown', 'KeyA', false))).toBe(false)
  })

  it('should keep the right Option up when the left one is pressed', () => {
    expect(rightOptionHeld(false, event('keydown', 'AltLeft', true))).toBe(false)
  })
})

function setup(mode: 'left' | 'both' | 'none') {
  const terminal = { options: { macOptionIsMeta: true } } as unknown as Terminal
  const keys = attachOptionKeys(terminal, mode)
  const press = (type: string, code: string, altKey = true) =>
    keys.onKey(new KeyboardEvent(type, { code, altKey }))
  return { terminal, keys, press }
}

describe('attachOptionKeys', () => {
  it('should type characters with the right Option and keep the left one as Meta when the mode is left', () => {
    // Arrange
    const { terminal, press } = setup('left')

    // Act
    press('keydown', 'AltRight')
    const right = terminal.options.macOptionIsMeta
    press('keyup', 'AltRight', false)
    press('keydown', 'AltLeft')
    const left = terminal.options.macOptionIsMeta

    // Assert
    expect([right, left]).toEqual([false, true])
  })

  it('should give Meta back when the terminal loses the focus with the right Option down', () => {
    // Arrange
    const { terminal, keys, press } = setup('left')
    press('keydown', 'AltRight')

    // Act
    keys.reset()

    // Assert
    expect(terminal.options.macOptionIsMeta).toBe(true)
  })

  it('should let every key reach xterm when it sets the switch', () => {
    const { press } = setup('left')

    expect(press('keydown', 'AltRight')).toBe(true)
  })

  it('should follow a new mode at once when the setting changes', () => {
    // Arrange
    const { terminal, keys } = setup('left')

    // Act
    keys.setMode('none')

    // Assert
    expect(terminal.options.macOptionIsMeta).toBe(false)
  })
})
