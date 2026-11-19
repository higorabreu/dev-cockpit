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
