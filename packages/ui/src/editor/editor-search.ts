import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  SearchQuery,
  search,
  searchPanelOpen,
  selectNextOccurrence,
  setSearchQuery,
} from '@codemirror/search'
import type { EditorState, Extension } from '@codemirror/state'
import {
  type Command,
  type EditorView,
  type KeyBinding,
  keymap,
  type Panel,
  runScopeHandlers,
  type ViewUpdate,
} from '@codemirror/view'
import { h, icon } from '../panel/dom.ts'
import { closeGoToLine } from './editor-goto.ts'
import { fieldBox, focusField, slideOut } from './find-field.ts'

// What the bar says, from the catalogs
export interface SearchTexts {
  readonly find: string
  readonly replace: string
  readonly next: string
  readonly previous: string
  readonly matchCase: string
  readonly wholeWord: string
  readonly regexp: string
  readonly replaceOne: string
  readonly replaceAll: string
  readonly toggleReplace: string
  readonly close: string
  readonly none: string
  readonly invalid: string
  count(current: number, total: number, more: boolean): string
}

// Replace all from the replace field, as VS Code has it
const REPLACE_ALL_KEY = { pc: 'Ctrl+Alt+Enter', mac: '⌥⌘Enter' } as const

// Counting stops here: past it the bar says "+" rather than walk a huge file on every key
export const MAX_COUNTED = 2000
// Typing in the file counts again after this pause, so a key never waits for a walk of the whole file
const RECOUNT_MS = 150

export interface MatchCount {
  // From 1; 0 when the selection is on no match
  readonly current: number
  readonly total: number
  readonly more: boolean
  // The lines that hold a match, from 1, once each, for the marks beside the scrollbar
  readonly lines: readonly number[]
  readonly currentLine: number | undefined
}

// How many matches the query has, which one the selection holds and on which lines they are
export function countMatches(state: EditorState, query: SearchQuery): MatchCount {
  const { from, to } = state.selection.main
  const cursor = query.getCursor(state)
  const lines: number[] = []
  let total = 0
  let current = 0
  let currentLine: number | undefined
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total++
    const line = state.doc.lineAt(next.value.from).number
    if (lines.at(-1) !== line) lines.push(line)
    if (next.value.from === from && next.value.to === to) {
      current = total
      currentLine = line
    }
    if (total >= MAX_COUNTED)
      return { current, total, more: !cursor.next().done, lines, currentLine }
  }
  return { current, total, more: false, lines, currentLine }
}

// One mark per line with a match, placed along the scroller's height as the scrollbar maps the file; a
// redraw replaces them all, after the same pause as the count
function drawMarks(view: EditorView, marks: HTMLElement, found: MatchCount | undefined) {
  const scroller = view.scrollDOM
  marks.style.top = `${scroller.offsetTop}px`
  marks.style.height = `${scroller.clientHeight}px`
  const total = view.state.doc.lines
  const height = scroller.clientHeight
  marks.replaceChildren(
    ...(found?.lines ?? []).map((line) =>
      h('div', {
        class: line === found?.currentLine ? 'cm-search-mark current' : 'cm-search-mark',
        style: `top: ${Math.round(((line - 1) / Math.max(1, total)) * (height - 3))}px`,
      }),
    ),
  )
}

const ICONS = {
  chevron: '<path d="M9 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  replaceOne: '<path d="M4 7h10M4 12h7"/><path d="M14 15l3 3 4-6"/>',
  replaceAll:
    '<path d="M4 6h10M4 11h10M4 16h6"/><path d="M13 17l2.5 2.5L20 14"/><path d="M17 9l1.5 1.5L21 7"/>',
} as const

// Each open widget, so its keys can reach its fields
const panels = new WeakMap<EditorView, { focusFind(): void; showReplace(): void }>()

// The widget at the top right of the editor, as VS Code's find widget: the query with its toggles, the
// count, previous, next and close; the chevron shows the replace row under it
function createSearchPanel(view: EditorView, mac: boolean, texts: () => SearchTexts): Panel {
  const t = texts()
  let query = getSearchQuery(view.state)
  const field = (name: string, label: string, value: string) =>
    h('input', {
      class: 'fv-find-field',
      type: 'text',
      name,
      value,
      placeholder: label,
      'aria-label': label,
      spellcheck: 'false',
      autocomplete: 'off',
      ...(name === 'search' ? { 'main-field': 'true' } : {}),
    })
  const find = field('search', t.find, query.search)
  const replace = field('replace', t.replace, query.replace)
  const toggle = (label: string, text: string, pressed: boolean) =>
    h(
      'button',
      {
        type: 'button',
        class: 'fv-search-toggle',
        'aria-pressed': String(pressed),
        'aria-label': label,
        'data-tip': label,
      },
      text,
    )
  const matchCase = toggle(t.matchCase, 'Aa', query.caseSensitive)
  const wholeWord = toggle(t.wholeWord, 'ab', query.wholeWord)
  const regexp = toggle(t.regexp, '.*', query.regexp)
  const button = (svg: string, label: string, key?: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'fv-search-icon',
        'aria-label': label,
        'data-tip': label,
        ...(key ? { 'data-tip-key': key } : {}),
      },
      icon(svg, 14),
    )
  const expand = button(ICONS.chevron, t.toggleReplace)
  expand.setAttribute('aria-expanded', 'false')
  const previous = button(ICONS.up, t.previous, 'Shift+Enter')
  const next = button(ICONS.down, t.next, 'Enter')
  const close = button(ICONS.close, t.close, 'Esc')
  const count = h('span', { class: 'fv-search-count', role: 'status' })
  const replaceOne = button(ICONS.replaceOne, t.replaceOne, 'Enter')
  const replaceEvery = button(ICONS.replaceAll, t.replaceAll, REPLACE_ALL_KEY[mac ? 'mac' : 'pc'])
  const findBox = fieldBox(
    find,
    h('span', { class: 'fv-find-toggles' }, matchCase, wholeWord, regexp),
  )
  // Folded to no height and out of the keys' reach until the chevron or Ctrl+H opens it
  const replaceRow = h(
    'div',
    { class: 'fv-replace-row', inert: true },
    fieldBox(replace),
    h('span', { class: 'fv-search-actions' }, replaceOne, replaceEvery),
  )
  const marks = h('div', { class: 'cm-search-marks', 'aria-hidden': 'true' })
  let found: MatchCount | undefined
  const dom = h(
    'div',
    { class: 'fv-search' },
    h('div', { class: 'fv-search-row' }, expand, findBox, count, previous, next, close),
    replaceRow,
  )

  let recount: ReturnType<typeof setTimeout> | undefined
  function showCount() {
    clearTimeout(recount)
    found = undefined
    if (!query.search) {
      count.textContent = ''
      findBox.removeAttribute('data-invalid')
      drawMarks(view, marks, found)
      return
    }
    if (!query.valid) {
      count.textContent = texts().invalid
      findBox.setAttribute('data-invalid', '')
      drawMarks(view, marks, found)
      return
    }
    found = countMatches(view.state, query)
    drawMarks(view, marks, found)
    count.textContent =
      found.total === 0 ? texts().none : texts().count(found.current, found.total, found.more)
    // No match: the field's edge in the critical color, and the count says it in words
    findBox.toggleAttribute('data-invalid', found.total === 0)
  }

  function commit() {
    const next = new SearchQuery({
      search: find.value,
      replace: replace.value,
      caseSensitive: matchCase.getAttribute('aria-pressed') === 'true',
      wholeWord: wholeWord.getAttribute('aria-pressed') === 'true',
      regexp: regexp.getAttribute('aria-pressed') === 'true',
    })
    if (next.eq(query)) return
    query = next
    view.dispatch({ effects: setSearchQuery.of(next) })
  }

  function showReplace(shown = true) {
    replaceRow.inert = !shown
    dom.toggleAttribute('data-replace', shown)
    expand.setAttribute('aria-expanded', String(shown))
    if (shown) focusField(replace)
  }

  const run = (command: Command) => () => {
    commit()
    command(view)
  }

  for (const input of [find, replace]) {
    input.addEventListener('input', commit)
    input.addEventListener('keydown', (event) => {
      // F3, Mod-g, Mod-f and Escape, as the editor itself has them
      if (runScopeHandlers(view, event, 'search-panel')) {
        event.preventDefault()
        return
      }
      if (event.key !== 'Enter') return
      event.preventDefault()
      if (input === replace && (event.ctrlKey || event.metaKey) && event.altKey) replaceAll(view)
      else if (input === replace) replaceNext(view)
      else if (event.shiftKey) findPrevious(view)
      else findNext(view)
    })
  }
  for (const pressed of [matchCase, wholeWord, regexp])
    pressed.addEventListener('click', () => {
      pressed.setAttribute('aria-pressed', String(pressed.getAttribute('aria-pressed') !== 'true'))
      commit()
    })
  expand.addEventListener('click', () =>
    showReplace(expand.getAttribute('aria-expanded') !== 'true'),
  )
  previous.addEventListener('click', run(findPrevious))
  next.addEventListener('click', run(findNext))
  replaceOne.addEventListener('click', run(replaceNext))
  replaceEvery.addEventListener('click', run(replaceAll))
  close.addEventListener('click', () => closeSearchPanel(view))

  return {
    dom,
    top: true,
    mount() {
      view.dom.append(marks)
      panels.set(view, {
        focusFind: () => focusField(find),
        showReplace,
      })
      find.select()
      showCount()
    },
    update(update: ViewUpdate) {
      for (const transaction of update.transactions)
        for (const effect of transaction.effects) {
          if (!effect.is(setSearchQuery) || effect.value.eq(query)) continue
          query = effect.value
          find.value = query.search
          replace.value = query.replace
          matchCase.setAttribute('aria-pressed', String(query.caseSensitive))
          wholeWord.setAttribute('aria-pressed', String(query.wholeWord))
          regexp.setAttribute('aria-pressed', String(query.regexp))
        }
      // A new query, or a step to another match, shows at once
      const asked = update.transactions.some(
        (transaction) =>
          transaction.isUserEvent('select.search') ||
          transaction.effects.some((effect) => effect.is(setSearchQuery)),
      )
      if (asked) showCount()
      else if (update.geometryChanged) drawMarks(view, marks, found)
      if (asked) return
      if (update.docChanged || update.selectionSet) {
        clearTimeout(recount)
        recount = setTimeout(showCount, RECOUNT_MS)
      }
    },
    destroy() {
      clearTimeout(recount)
      marks.remove()
      panels.delete(view)
      slideOut(view, dom)
    },
  }
}

// A selection on one line becomes the query, as CodeMirror and VS Code seed it; longer ones are no query
const MAX_SEED = 200

// The editor's selection as the new query, keeping the toggles; nothing when it is empty or spans lines
function seedFromSelection(view: EditorView) {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
  if (text === '' || text.length > MAX_SEED || /[\r\n]/.test(text)) return
  const current = getSearchQuery(view.state)
  const seeded = current.regexp ? text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') : text
  if (current.search === seeded) return
  const query = new SearchQuery({
    search: seeded,
    replace: current.replace,
    caseSensitive: current.caseSensitive,
    wholeWord: current.wholeWord,
    regexp: current.regexp,
  })
  view.dispatch({ effects: setSearchQuery.of(query) })
}

// Ctrl+F (⌘F) and the header's Find, as VS Code has them: the bar opens, or, open already, its field takes
// the focus with the query selected; from the text, a selection there becomes the query first (from the
// bar, what the user typed stays). Never a toggle: Esc closes the bar
export const openFind: Command = (view) => {
  closeGoToLine(view)
  const panel = panels.get(view)
  if (!searchPanelOpen(view.state) || !panel) return openSearchPanel(view)
  if (view.hasFocus) seedFromSelection(view)
  panel.focusFind()
  return true
}

// Ctrl+H (⌥⌘F): the same for the replace row, which opens under the query with its text selected
export const openReplace: Command = (view) => {
  closeGoToLine(view)
  if (!searchPanelOpen(view.state)) openSearchPanel(view)
  else if (view.hasFocus) seedFromSelection(view)
  panels.get(view)?.showReplace()
  return true
}

// The editor's keys for the search, as the plan lists them; on the Mac ⌘G stays find next (⌃G goes to a
// line, editor-goto.ts), as in VS Code
function searchKeys(mac: boolean): KeyBinding[] {
  const scope = 'editor search-panel'
  return [
    { key: 'Mod-f', run: openFind, scope, preventDefault: true },
    { key: 'F3', run: findNext, shift: findPrevious, scope, preventDefault: true },
    { key: 'Escape', run: closeSearchPanel, scope },
    { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
    ...(mac
      ? [
          { key: 'Mod-g', run: findNext, shift: findPrevious, scope, preventDefault: true },
          { key: 'Mod-Alt-f', run: openReplace, scope, preventDefault: true },
        ]
      : [{ key: 'Ctrl-h', run: openReplace, scope, preventDefault: true }]),
  ]
}

// The search bar at the top of the file, drawn with the cockpit's own controls and words
export const searchBar = (mac: boolean, texts: () => SearchTexts): Extension => [
  search({ top: true, createPanel: (view) => createSearchPanel(view, mac, texts) }),
  keymap.of(searchKeys(mac)),
]
