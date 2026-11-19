// @vitest-environment happy-dom
import { EditorState } from '@codemirror/state'
import { editsByLine, mergeThreeWay } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { lineEditChanges, reloadChange } from './code-editor.ts'

const stateOf = (text: string, separator = '\n') =>
  EditorState.create({ doc: text, extensions: EditorState.lineSeparator.of(separator) })

const applied = (state: EditorState, text: string) => {
  const change = reloadChange(state, text)
  return change ? state.update({ changes: change }).state.sliceDoc() : state.sliceDoc()
}

describe('reloadChange', () => {
  it.each([
    ['a\nb\nc', 'a\nB\nc'],
    ['a\nb\nc', 'a\nb'],
    ['a\nb', 'a\nb\nc'],
    ['a\nb\n', 'a\nb'],
    ['a\nb', 'a\nb\n'],
    ['x\ny', 'z'],
    ['', 'new\n'],
    ['one\n', ''],
    ['a\nb\nc\nd', 'a\nc\nd'],
  ])('should turn %j into %j when the disk holds the second', (before, after) => {
    expect(applied(stateOf(before), after)).toBe(after)
  })

  it('should rewrite only the lines that differ when a line in the middle changed', () => {
    // Arrange
    const state = stateOf('one\ntwo\nthree\nfour\n')

    // Act
    const change = reloadChange(state, 'one\nTWO\nthree\nfour\n')

    // Assert
    expect(change).toEqual({ from: 4, to: 8, insert: 'TWO\n' })
  })

  it('should keep CRLF line breaks when the file uses them', () => {
    const state = stateOf('a\r\nb\r\nc\r\n', '\r\n')

    expect(applied(state, 'a\r\nB\r\nc\r\n')).toBe('a\r\nB\r\nc\r\n')
  })

  it('should change nothing when the text is the same', () => {
    expect(reloadChange(stateOf('same\n'), 'same\n')).toBeUndefined()
  })
})

describe('lineEditChanges', () => {
  it('should apply a merge to the editor text when the file uses CRLF', () => {
    // Arrange
    const base = 'a\r\nb\r\nc\r\nd\r\n'
    const mine = 'a\r\nB\r\nc\r\nd\r\n'
    const disk = 'a\r\nb\r\nc\r\nD\r\n'
    const merged = mergeThreeWay(base, mine, disk)
    if (merged.kind !== 'merged') throw new Error('expected a merge')
    const state = stateOf(mine, '\r\n')

    // Act
    const changes = lineEditChanges(state, editsByLine(mine, merged.edits))
    const result = state.update({ changes }).state.sliceDoc()

    // Assert
    expect(result).toBe(merged.text)
    expect(result).toBe('a\r\nB\r\nc\r\nD\r\n')
  })

  it('should apply edits at the end of a text without a final line break', () => {
    // Arrange
    const base = 'a\nb\nc\nd\ne'
    const mine = 'A\nb\nc\nd\ne'
    const disk = 'a\nb\nc\nd\nE'
    const merged = mergeThreeWay(base, mine, disk)
    if (merged.kind !== 'merged') throw new Error('expected a merge')
    const state = stateOf(mine)

    // Act
    const result = state
      .update({ changes: lineEditChanges(state, editsByLine(mine, merged.edits)) })
      .state.sliceDoc()

    // Assert
    expect(result).toBe('A\nb\nc\nd\nE')
  })
})
