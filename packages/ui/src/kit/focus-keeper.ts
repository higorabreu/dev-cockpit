// Text inputs keep a selection; a number input throws when asked to set one
const SELECTABLE = new Set(['text', 'search', 'password', 'url'])

const selectable = (element: Element | null | undefined): element is HTMLInputElement =>
  element instanceof HTMLInputElement && SELECTABLE.has(element.type)

// A screen drawn from nothing finds its focused control by `data-focus`, with unsaved text and selection
export function createFocusKeeper(root: HTMLElement) {
  // Typed since its last change event: the new control would otherwise show the saved value
  const typed = new WeakSet<EventTarget>()
  root.addEventListener('input', (event) => {
    if (event.target) typed.add(event.target)
  })
  // Capture, so a handler that redraws at once already sees the value as saved
  root.addEventListener(
    'change',
    (event) => {
      if (event.target) typed.delete(event.target)
    },
    true,
  )

  return {
    redraw(draw: () => void) {
      const active = document.activeElement
      const key = active?.getAttribute('data-focus')
      const input = active instanceof HTMLInputElement ? active : undefined
      const value = input && typed.has(input) ? input.value : undefined
      const selection = selectable(input)
        ? { start: input.selectionStart, end: input.selectionEnd }
        : undefined
      draw()
      if (!key) return
      const next = root.querySelector<HTMLElement>(`[data-focus="${key}"]`)
      next?.focus()
      if (!(next instanceof HTMLInputElement)) return
      if (value !== undefined) {
        next.value = value
        typed.add(next)
      }
      const { start = null, end = null } = selection ?? {}
      if (selectable(next) && start !== null && end !== null) next.setSelectionRange(start, end)
    },
  }
}
