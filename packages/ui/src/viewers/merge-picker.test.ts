// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createMergePicker, type PickerTexts } from './merge-picker.ts'

const texts: PickerTexts = {
  mine: 'Mine',
  disk: 'Disk',
  useMine: 'Use mine',
  useDisk: 'Use disk',
  useBoth: 'Use both',
  done: 'Done',
  cancel: 'Cancel',
  next: 'Next conflict',
  previous: 'Previous conflict',
  label: 'Compare',
  conflict: (index, total) => `Conflict ${index} of ${total}`,
  chosen: (choice) => `Using ${choice}`,
  left: (count) => `${count} left`,
  unchanged: (count) => `${count} unchanged lines`,
}

const lines = (words: string) =>
  words
    .split(' ')
    .map((word) => `${word}\n`)
    .join('')

afterEach(() => {
  document.body.replaceChildren()
})

function setUp(
  base = lines('a b c d e f g h i j'),
  mine = lines('a M1 c d e f g h i M2'),
  disk = lines('a D1 c d e f g h i D2'),
) {
  const parent = document.createElement('div')
  document.body.append(parent)
  const outcome: { text?: string; cancelled: boolean } = { cancelled: false }
  const picker = createMergePicker({
    parent,
    base,
    mine,
    disk,
    lineBreak: '\n',
    texts,
    doneKey: 'Ctrl+Enter',
    done: (text) => {
      outcome.text = text
    },
    cancel: () => {
      outcome.cancelled = true
    },
  })
  const key = (name: string, extra: KeyboardEventInit = {}) =>
    picker.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true, ...extra }),
    )
  const done = () => picker.element.querySelector<HTMLButtonElement>('.fv-action.primary')
  return { picker, outcome, key, done, parent }
}

describe('createMergePicker', () => {
  it('should list each conflict with both sides and keep Done off while one has no choice', () => {
    // Arrange, Act
    const { picker, done } = setUp()

    // Assert
    expect(picker.conflicts).toBe(2)
    const sides = [...picker.element.querySelectorAll('.mp-conflict .mp-lines')].map(
      (side) => side.textContent,
    )
    expect(sides).toEqual(['M1', 'D1', 'M2', 'D2'])
    expect(done()?.disabled).toBe(true)
  })

  it('should write the chosen sides into the result when Done follows a choice for every conflict', () => {
    // Arrange
    const { picker, outcome, done } = setUp()
    const buttons = [
      ...picker.element.querySelectorAll<HTMLButtonElement>('.mp-conflict .fv-action'),
    ]

    // Act
    buttons[0]?.click()
    buttons[5]?.click()
    done()?.click()

    // Assert
    expect(outcome.text).toBe(lines('a M1 c d e f g h i M2 D2'))
  })

  it('should choose with the keys and move to the next conflict when a side is picked', () => {
    // Arrange
    const { picker, outcome, key } = setUp()
    picker.focus()

    // Act
    key('d')
    key('m')
    key('Enter', { ctrlKey: true })

    // Assert
    expect(outcome.text).toBe(lines('a D1 c d e f g h i M2'))
    const states = [...picker.element.querySelectorAll('.mp-conflict')].map((block) =>
      block.getAttribute('data-choice'),
    )
    expect(states).toEqual(['disk', 'mine'])
  })

  it('should show a chosen conflict by its pressed button and its words, not by color alone', () => {
    const { picker, key } = setUp()
    picker.focus()

    key('b')

    const block = picker.element.querySelector('.mp-conflict')
    expect(block?.querySelector('[aria-pressed="true"]')?.textContent).toBe('Use both')
    expect(block?.querySelector('.mp-choice')?.textContent).toBe('Using both')
  })

  it('should go back to the conflict strip without a result when Esc is pressed', () => {
    const { outcome, key } = setUp()

    key('Escape')

    expect(outcome).toEqual({ cancelled: true })
  })

  it('should fold a long stretch both sides agree on when it lies between conflicts', () => {
    const base = lines('a b c d e f g h i j k l m n')
    const { picker } = setUp(base, base.replace('a\n', 'M\n'), base.replace('a\n', 'D\n'))

    expect(picker.element.querySelector('.mp-fold')?.textContent).toBe('10 unchanged lines')
  })
})
