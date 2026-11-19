import { closeSearchPanel } from '@codemirror/search'
import { EditorSelection, type Extension, Facet, StateEffect, StateField } from '@codemirror/state'
import {
  type Command,
  EditorView,
  keymap,
  type Panel,
  runScopeHandlers,
  showPanel,
} from '@codemirror/view'
import { keys } from '../kit/keys.ts'
import { h, icon } from '../panel/dom.ts'
import { fieldBox, focusField, slideOut } from './find-field.ts'

// What the bar says, from the catalogs
export interface GoToTexts {
  readonly label: string
  readonly placeholder: string
  readonly invalid: string
  readonly go: string
  readonly close: string
  // Inside the field: how many lines the file has ("of 245")
  position(total: number): string
}

export interface LineTarget {
  // From 1, within the file
  readonly line: number
  // From 1; undefined goes to the line's start
  readonly column?: number
}

const TARGET = /^:?\s*(\d+)\s*(?:[:,]\s*(\d+))?$/

// What the user typed, as VS Code reads it: `12`, `12:4`, `12,4` or `:12`. A line past the end goes to the
// last, line 0 to the first; anything else is undefined, and the field says it is not a line
export function parseLineTarget(text: string, lines: number): LineTarget | undefined {
  const found = TARGET.exec(text.trim())
  if (!found) return undefined
  const line = Math.min(Math.max(1, Number(found[1])), Math.max(1, lines))
  const column = found[2] === undefined ? undefined : Math.max(1, Number(found[2]))
  return column === undefined ? { line } : { line, column }
}

// Where a target lands in the text: a column past the line's end stays at its end
export function targetOffset(
  line: { readonly from: number; readonly length: number },
  target: LineTarget,
): number {
  return line.from + Math.min(line.length, (target.column ?? 1) - 1)
}

const goToTexts = Facet.define<() => GoToTexts, (() => GoToTexts) | undefined>({
  combine: (values) => values[0],
})

const setOpen = StateEffect.define<boolean>()

const CLOSE = '<path d="M6 6l12 12M18 6L6 18"/>'

function createGoToPanel(view: EditorView): Panel {
  const texts = () => {
    const read = view.state.facet(goToTexts)
    if (!read) throw new Error('invariant: the go to line bar has no texts')
    return read()
  }
  const t = texts()
  const input = h('input', {
    class: 'fv-find-field fv-goto-field',
    type: 'text',
    inputmode: 'numeric',
    placeholder: t.placeholder,
    'aria-label': t.label,
    spellcheck: 'false',
    autocomplete: 'off',
  })
  // Inside the field's right end: the line count, or why the entry is not a line
  const inside = h('span', { class: 'fv-find-inside', role: 'status' })
  const box = fieldBox(input, inside)
  const close = h(
    'button',
    {
      type: 'button',
      class: 'fv-search-icon',
      'aria-label': t.close,
      'data-tip': t.close,
      'data-tip-key': 'Esc',
    },
    icon(CLOSE, 14),
  )
  const dom = h(
    'div',
    { class: 'fv-search fv-goto' },
    h(
      'div',
      { class: 'fv-search-row' },
      box,
      h('span', { class: 'fv-goto-hint', 'data-tip': t.go }, keys('Enter', 'compact')),
      close,
    ),
  )
  let bad = false

  function showInside() {
    inside.textContent = bad ? texts().invalid : texts().position(view.state.doc.lines)
  }

  // Not a line: the field's edge in the critical color, and the words inside it say so
  function markInvalid(invalid: boolean) {
    bad = invalid
    input.toggleAttribute('aria-invalid', invalid)
    box.toggleAttribute('data-invalid', invalid)
    showInside()
  }

  function go() {
    if (input.value.trim() === '') return
    const target = parseLineTarget(input.value, view.state.doc.lines)
    if (!target) {
      markInvalid(true)
      return
    }
    const at = targetOffset(view.state.doc.line(target.line), target)
    view.dispatch({
      selection: EditorSelection.cursor(at),
      effects: [setOpen.of(false), EditorView.scrollIntoView(at, { y: 'center' })],
      userEvent: 'select.goto',
    })
    view.focus()
  }

  input.addEventListener('input', () => markInvalid(false))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      go()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeGoToLine(view)
    } else if (runScopeHandlers(view, event, 'search-panel')) {
      // Ctrl+F, Ctrl+H and Ctrl+G from this field, as from the find widget's
      event.preventDefault()
    }
  })
  close.addEventListener('click', () => closeGoToLine(view))

  return {
    dom,
    top: true,
    mount() {
      showInside()
      focusField(input)
    },
    update(update) {
      if (update.docChanged) showInside()
    },
    destroy: () => slideOut(view, dom),
  }
}

const goToOpen = StateField.define<boolean>({
  create: () => false,
  update(open, transaction) {
    for (const effect of transaction.effects) if (effect.is(setOpen)) return effect.value
    return open
  },
  provide: (field) => showPanel.from(field, (open) => (open ? createGoToPanel : null)),
})

const isOpen = (view: EditorView) => view.state.field(goToOpen, false) === true

export const closeGoToLine: Command = (view) => {
  if (!isOpen(view)) return false
  view.dispatch({ effects: setOpen.of(false) })
  view.focus()
  return true
}

// Ctrl+G (⌃G on a Mac, where ⌘G finds the next match) and the header's button; open already, the field
// takes the focus again with its text selected
export const openGoToLine: Command = (view) => {
  // One drawer at a time in the corner
  closeSearchPanel(view)
  if (!isOpen(view)) view.dispatch({ effects: setOpen.of(true) })
  else {
    const input = view.dom.querySelector<HTMLInputElement>('.fv-goto-field')
    if (input) focusField(input)
  }
  return true
}

// Go to line in the find widget's place and shape, at the top right of the file
export const goToLineBar = (texts: () => GoToTexts): Extension => [
  goToTexts.of(texts),
  goToOpen,
  keymap.of([
    // From the find widget's fields too, so the key swaps one drawer for the other as in VS Code
    { key: 'Ctrl-g', run: openGoToLine, scope: 'editor search-panel', preventDefault: true },
    { key: 'Escape', run: closeGoToLine },
  ]),
]
