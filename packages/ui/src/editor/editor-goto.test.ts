// @vitest-environment happy-dom
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeGoToLine,
  type GoToTexts,
  goToLineBar,
  openGoToLine,
  parseLineTarget,
  targetOffset,
} from './editor-goto.ts'

describe('parseLineTarget', () => {
  it.each([
    ['12', { line: 12 }],
    [' 12 ', { line: 12 }],
    [':12', { line: 12 }],
    ['12:4', { line: 12, column: 4 }],
    ['12,4', { line: 12, column: 4 }],
    [':12:4', { line: 12, column: 4 }],
  ])('should read %j as a line and a column when the file is long enough', (text, target) => {
    expect(parseLineTarget(text, 100)).toEqual(target)
  })

  it('should go to the last line when the number is past the end', () => {
    expect(parseLineTarget('500', 40)).toEqual({ line: 40 })
  })

  it('should go to the first line and column when either is 0', () => {
    expect(parseLineTarget('0:0', 40)).toEqual({ line: 1, column: 1 })
  })

  it.each(['', 'abc', '12a', '-3', '1.5', '12:', ':', '1:2:3'])(
    'should take %j for no line when it is not a number',
    (text) => {
      expect(parseLineTarget(text, 40)).toBeUndefined()
    },
  )
})

describe('targetOffset', () => {
  it('should stop at the end of the line when the column is past it', () => {
    expect(targetOffset({ from: 10, length: 4 }, { line: 2, column: 9 })).toBe(14)
    expect(targetOffset({ from: 10, length: 4 }, { line: 2, column: 3 })).toBe(12)
    expect(targetOffset({ from: 10, length: 4 }, { line: 2 })).toBe(10)
  })
})

const texts: GoToTexts = {
  label: 'Go to line',
  placeholder: 'Line, or line:column',
  invalid: 'Not a line number',
  go: 'Go',
  close: 'Close go to line',
  position: (total) => `of ${total}`,
}

// The open drawer, not the copy of a closed one that slides away (find-field.ts)
const LIVE = '.cm-panels-top:not(.fv-drawer-ghost)'

const views: EditorView[] = []
afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy()
    view.dom.remove()
  }
})

function setUp(doc = 'one\ntwo\nthree\nfour\n') {
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: goToLineBar(() => texts) }),
  })
  views.push(view)
  const field = () => view.dom.querySelector<HTMLInputElement>(`${LIVE} .fv-goto-field`)
  const enter = (text: string) => {
    const input = field()
    if (!input) throw new Error('expected the go to line field')
    input.value = text
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }
  return { view, field, enter }
}

describe('goToLineBar', () => {
  it('should open the bar with its words and the cursor line when the key runs', () => {
    // Arrange
    const { view, field } = setUp()
    view.dispatch({ selection: EditorSelection.cursor(5) })

    // Act
    openGoToLine(view)

    // Assert
    expect(field()?.placeholder).toBe('Line, or line:column')
    expect(field()?.getAttribute('aria-label')).toBe('Go to line')
    expect(view.dom.querySelector('.fv-goto .fv-find-inside')?.textContent).toBe('of 5')
    expect(document.activeElement).toBe(field())
  })

  it('should move the cursor to the line and column and close when Enter goes', () => {
    // Arrange
    const { view, field, enter } = setUp()
    openGoToLine(view)

    // Act
    enter('3:2')

    // Assert
    expect(view.state.selection.main.head).toBe(9)
    expect(field()).toBeNull()
  })

  it('should keep the bar open and say why when the entry is not a line', () => {
    // Arrange
    const { view, field, enter } = setUp()
    openGoToLine(view)

    // Act
    enter('abc')

    // Assert
    expect(field()?.hasAttribute('aria-invalid')).toBe(true)
    expect(view.dom.querySelector('.fv-goto .fv-find-inside')?.textContent).toBe(
      'Not a line number',
    )
    expect(view.state.selection.main.head).toBe(0)
  })

  it('should focus the field and select its text when the key runs with the bar open', () => {
    // Arrange
    const { view, field } = setUp()
    openGoToLine(view)
    const input = field()
    if (!input) throw new Error('expected the go to line field')
    input.value = '42'
    view.focus()

    // Act
    openGoToLine(view)

    // Assert
    expect(field()).toBe(input)
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
  })

  it('should close the bar and give the focus back to the text when Esc is pressed', () => {
    // Arrange
    const { view, field } = setUp()
    openGoToLine(view)

    // Act
    field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    // Assert
    expect(field()).toBeNull()
    expect(view.hasFocus).toBe(true)
    expect(closeGoToLine(view)).toBe(false)
  })
})
