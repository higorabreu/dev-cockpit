// @vitest-environment happy-dom
import { SearchQuery } from '@codemirror/search'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { countMatches, MAX_COUNTED } from './editor-search.ts'

describe('countMatches', () => {
  it('should count the matches and say which one the selection holds', () => {
    // Arrange
    const state = EditorState.create({
      doc: 'let a = 1\nlet b = 2\nlet c = 3\n',
      selection: EditorSelection.single(10, 13),
    })

    // Act
    const found = countMatches(state, new SearchQuery({ search: 'let' }))

    // Assert
    expect(found).toEqual({ current: 2, total: 3, more: false, lines: [1, 2, 3], currentLine: 2 })
  })

  it('should stop counting and say there are more when a file holds a huge number of matches', () => {
    const state = EditorState.create({ doc: 'x'.repeat(MAX_COUNTED + 5) })

    expect(countMatches(state, new SearchQuery({ search: 'x' }))).toMatchObject({
      current: 0,
      total: MAX_COUNTED,
      more: true,
      lines: [1],
    })
  })

  it('should count whole words only when the toggle is on', () => {
    const state = EditorState.create({ doc: 'cat category cat' })

    expect(countMatches(state, new SearchQuery({ search: 'cat', wholeWord: true })).total).toBe(2)
  })
})
