import type { EditorView } from '@codemirror/view'
import { h } from '../panel/dom.ts'

// A field of the find widget or Go to line, with what belongs to it drawn inside its right end (the
// toggles, the line count)
export function fieldBox(input: HTMLInputElement, ...inside: HTMLElement[]): HTMLElement {
  const box = h('div', { class: 'fv-find-box' }, input, ...inside)
  // A click beside the text still reaches the field, as in an input of its own
  box.addEventListener('mousedown', (event) => {
    if (event.target !== box) return
    event.preventDefault()
    input.focus()
  })
  return box
}

export function focusField(input: HTMLInputElement) {
  input.focus()
  input.select()
}

// The slide lasts --motion-fast; past this the copy goes even if no animation ran (a hidden window)
const SLIDE_LIMIT_MS = 400

// The drawer slides down only while it opens (styles/editor.css): a file view shown again over the terminal
// draws an open drawer as it is, since a plain animation would replay when the view comes back
export function slideIn(dom: HTMLElement) {
  dom.setAttribute('data-opening', '')
  const settle = () => dom.removeAttribute('data-opening')
  dom.addEventListener('animationend', settle, { once: true })
  setTimeout(settle, SLIDE_LIMIT_MS)
}

// CodeMirror takes a closed drawer out at once, so a copy of it, inert, slides back up under the header
// (styles/editor.css); with reduced motion, or a view on its way out, it simply goes
export function slideOut(view: EditorView, dom: HTMLElement) {
  if (!view.dom.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const copy = dom.cloneNode(true)
  const ghost = h(
    'div',
    { class: 'cm-panels cm-panels-top fv-drawer-ghost', 'aria-hidden': 'true', inert: true },
    copy,
  )
  view.dom.append(ghost)
  const remove = () => ghost.remove()
  ghost.addEventListener('animationend', remove, { once: true })
  setTimeout(remove, SLIDE_LIMIT_MS)
}
