// @vitest-environment happy-dom
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { cockpitTheme } from './editor-theme.ts'

const views: EditorView[] = []
afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy()
    view.dom.remove()
  }
})

describe('cockpitTheme', () => {
  it('should paint the line numbers on the window color when the text scrolls sideways under them', () => {
    // Arrange
    document.documentElement.style.setProperty('--bg', '#0e0e0e')
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'x'.repeat(400),
        extensions: [lineNumbers(), cockpitTheme],
      }),
    })
    views.push(view)

    // Act
    const gutters = view.dom.querySelector<HTMLElement>('.cm-gutters')
    const style = gutters ? getComputedStyle(gutters) : undefined

    // Assert
    expect(style?.backgroundColor).toBe('#0e0e0e')
  })
})
