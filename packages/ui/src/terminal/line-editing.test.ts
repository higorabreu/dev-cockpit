// @vitest-environment happy-dom
import type { KeyInput } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { attachLineEditing, lineEditSequence } from './line-editing.ts'

const key = (value: string, init: Partial<KeyInput> = {}): KeyInput => ({
  key: value,
  code: value,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...init,
})

describe('lineEditSequence', () => {
  it.each([
    ['ArrowLeft', { metaKey: true }, '\x01'],
    ['ArrowRight', { metaKey: true }, '\x05'],
    ['Backspace', { metaKey: true }, '\x15'],
    ['ArrowLeft', { altKey: true }, '\x1bb'],
    ['ArrowRight', { altKey: true }, '\x1bf'],
    ['Delete', { altKey: true }, '\x1bd'],
  ] as const)(
    'should send the line editor sequence when %s is pressed with %o',
    (pressed, held, sequence) => {
      expect(lineEditSequence(key(pressed, held))).toBe(sequence)
    },
  )

  it('should leave Option+Backspace to xterm when it already deletes the word before the cursor', () => {
    expect(lineEditSequence(key('Backspace', { altKey: true }))).toBeUndefined()
  })

  it.each([
    ['ArrowLeft', {}],
    ['ArrowLeft', { metaKey: true, shiftKey: true }],
    ['ArrowLeft', { metaKey: true, altKey: true }],
    ['ArrowLeft', { ctrlKey: true }],
    ['ArrowLeft', { altKey: true, ctrlKey: true }],
    ['Delete', { metaKey: true }],
    ['b', { altKey: true }],
  ] as const)('should leave the key to xterm when %s is pressed with %o', (pressed, held) => {
    expect(lineEditSequence(key(pressed, held))).toBeUndefined()
  })
})

function setup(buffer: 'normal' | 'alternate') {
  const sent: string[] = []
  let notified = 0
  const terminal = {
    buffer: { active: { type: buffer } },
    input: (data: string) => void sent.push(data),
  }
  const onKey = attachLineEditing(terminal, () => {
    notified += 1
  })
  return { onKey, sent, notified: () => notified }
}

const press = (type: string, init: KeyboardEventInit) =>
  new KeyboardEvent(type, { cancelable: true, ...init })

describe('attachLineEditing', () => {
  it('should type the sequence and keep the key from xterm when Cmd+Left is pressed at the prompt', () => {
    // Arrange
    const { onKey, sent, notified } = setup('normal')
    const event = press('keydown', { key: 'ArrowLeft', metaKey: true })

    // Act
    const passes = onKey(event)

    // Assert
    expect(passes).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(sent).toEqual(['\x01'])
    expect(notified()).toBe(1)
  })

  it('should give the raw key to the program when the alternate buffer is active', () => {
    // Arrange
    const { onKey, sent } = setup('alternate')

    // Act
    const passes = onKey(press('keydown', { key: 'ArrowLeft', altKey: true }))

    // Assert
    expect(passes).toBe(true)
    expect(sent).toEqual([])
  })

  it('should let the release of the key reach xterm when it is a keyup', () => {
    // Arrange
    const { onKey, sent } = setup('normal')

    // Act
    const passes = onKey(press('keyup', { key: 'Backspace', metaKey: true }))

    // Assert
    expect(passes).toBe(true)
    expect(sent).toEqual([])
  })
})
