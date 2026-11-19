// @vitest-environment happy-dom
import { closeSearchPanel, getSearchQuery, SearchQuery } from '@codemirror/search'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { openGoToLine } from './editor-goto.ts'
import {
  countMatches,
  MAX_COUNTED,
  openFind,
  openReplace,
  type SearchTexts,
  searchBar,
} from './editor-search.ts'

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

const texts: SearchTexts = {
  find: 'Find',
  replace: 'Replace',
  next: 'Next match',
  previous: 'Previous match',
  matchCase: 'Match case',
  wholeWord: 'Whole word',
  regexp: 'Regular expression',
  replaceOne: 'Replace',
  replaceAll: 'Replace all',
  toggleReplace: 'Show replace',
  close: 'Close search',
  none: 'No results',
  invalid: 'Invalid expression',
  count: (current, total) => `${current} of ${total}`,
}

const views: EditorView[] = []
afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy()
    view.dom.remove()
  }
})

function setUp() {
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: 'alpha beta\ngamma beta\n',
      extensions: searchBar(false, () => texts),
    }),
  })
  views.push(view)
  const field = (name: string) =>
    view.dom.querySelector<HTMLInputElement>(`.fv-find-field[name="${name}"]`)
  const selected = (input: HTMLInputElement | null) =>
    input ? input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0) : undefined
  const type = (name: string, text: string) => {
    const input = field(name)
    if (!input) throw new Error(`expected the ${name} field`)
    input.value = text
    input.dispatchEvent(new Event('input'))
  }
  return { view, field, selected, type }
}

describe('the search bar keys', () => {
  it('should focus the field and select the query when Ctrl+F runs with the bar open', () => {
    // Arrange
    const { view, field, selected, type } = setUp()
    openFind(view)
    type('search', 'gamma')
    view.focus()

    // Act
    openFind(view)

    // Assert
    expect(document.activeElement).toBe(field('search'))
    expect(selected(field('search'))).toBe('gamma')
  })

  it('should take the selection for the query when Ctrl+F runs from the text with the bar open', () => {
    // Arrange
    const { view, field, selected, type } = setUp()
    // happy-dom fires selectionchange at once when a field's value is set, inside CodeMirror's update;
    // a browser fires it later
    const quiet = (event: Event) => event.stopPropagation()
    window.addEventListener('selectionchange', quiet, true)
    view.dispatch({ selection: EditorSelection.single(6, 10) })
    openFind(view)
    type('search', 'gamma')
    view.focus()

    // Act
    openFind(view)

    // Assert
    expect(getSearchQuery(view.state).search).toBe('beta')
    expect(field('search')?.value).toBe('beta')
    expect(selected(field('search'))).toBe('beta')
    window.removeEventListener('selectionchange', quiet, true)
  })

  it('should keep the typed query when Ctrl+F runs from the bar itself', () => {
    // Arrange
    const { view, field, type } = setUp()
    view.dispatch({ selection: EditorSelection.single(6, 10) })
    openFind(view)
    type('search', 'gamma')
    field('search')?.focus()

    // Act
    openFind(view)

    // Assert
    expect(getSearchQuery(view.state).search).toBe('gamma')
  })

  it('should leave a selection over two lines out of the query when Ctrl+F runs from the text', () => {
    // Arrange
    const { view, type } = setUp()
    openFind(view)
    type('search', 'gamma')
    view.dispatch({ selection: EditorSelection.single(6, 14) })
    view.focus()

    // Act
    openFind(view)

    // Assert
    expect(getSearchQuery(view.state).search).toBe('gamma')
  })

  it('should open the replace row and select its text when Ctrl+H runs with the bar open', () => {
    // Arrange
    const { view, field, selected, type } = setUp()
    openFind(view)
    type('replace', 'delta')
    view.dispatch({ selection: EditorSelection.single(0, 5) })
    view.focus()

    // Act
    openReplace(view)

    // Assert
    expect(field('replace')?.closest('.fv-search-row')?.hasAttribute('hidden')).toBe(false)
    expect(document.activeElement).toBe(field('replace'))
    expect(selected(field('replace'))).toBe('delta')
    expect(getSearchQuery(view.state).search).toBe('alpha')
  })

  it('should close the bar and give the focus back to the text when Esc closes it', () => {
    // Arrange
    const { view, field } = setUp()
    openFind(view)
    field('search')?.focus()

    // Act
    closeSearchPanel(view)

    // Assert
    expect(field('search')).toBeNull()
    expect(view.hasFocus).toBe(true)
  })

  it('should mark the field invalid and say so when the query has no match', () => {
    // Arrange
    const { view, field, type } = setUp()
    openFind(view)

    // Act
    type('search', 'omega')

    // Assert
    expect(field('search')?.closest('.fv-find-box')?.hasAttribute('data-invalid')).toBe(true)
    expect(view.dom.querySelector('.fv-search-count')?.textContent).toBe('No results')
  })

  it('should keep one drawer in the corner when Go to line opens over the find widget', () => {
    // Arrange
    const { view, field } = setUp()
    openFind(view)

    // Act
    openGoToLine(view)

    // Assert
    expect(field('search')).toBeNull()
  })
})
