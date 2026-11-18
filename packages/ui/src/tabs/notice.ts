import type { Translator } from '@dck/core'

const VISIBLE_MS = 1800
// Room the tab strip keeps beside a full lasting notice: three tabs at their widest (168 px each, D74).
// With less, the notice shows its compact form; the rule reads widths only, so opening a tab never
// changes the notice's form
export const MIN_STRIP_PX = 508

// The notice takes a fixed spot at the end of the tab bar and disappears when empty, covering no tab. A
// lasting notice (an update) stays until replaced; a copy shows over it for a moment and gives it back.
// Given the tab strip, a lasting notice that would squeeze the tabs shows its compact form instead
export function createNotice(element: HTMLElement, i18n: Translator, strip?: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let full: readonly Node[] = []
  let compact: readonly Node[] = []
  // The full form's width, measured each time it changes, so the choice holds whichever form is shown
  let fullWidth = 0

  const width = (target: HTMLElement) => target.getBoundingClientRect().width
  const isCompact = () => element.classList.contains('compact')

  function squeezes(): boolean {
    if (!strip || compact.length === 0) return false
    return width(strip) + width(element) - fullWidth < MIN_STRIP_PX
  }

  function showForm(small: boolean) {
    element.classList.toggle('compact', small)
    element.replaceChildren(...(small ? compact : full))
  }

  // While a copy shows over the compact form, the strip ends where the full form would end it
  function cover(covered: number | undefined) {
    if (!strip) return
    if (covered === undefined) {
      delete strip.dataset.covered
      strip.style.removeProperty('--covered')
      return
    }
    strip.dataset.covered = ''
    strip.style.setProperty('--covered', `${covered}px`)
  }

  function showLasting() {
    timer = undefined
    cover(undefined)
    element.style.removeProperty('min-width')
    element.style.removeProperty('min-height')
    element.classList.toggle('lasting', full.length > 0)
    // Drawn full first to learn its width; both draws land before the next paint
    showForm(false)
    fullWidth = width(element)
    if (squeezes()) showForm(true)
  }

  // The window's width changed: the form follows, and is left alone when it stays (the focus stays on it)
  function refit() {
    if (timer !== undefined || full.length === 0) return
    const small = squeezes()
    if (small !== isCompact()) showForm(small)
  }

  if (strip) new ResizeObserver(refit).observe(strip)

  return {
    copied(text: string) {
      const count = text.length
      const label = document.createElement('span')
      const amount = document.createElement('span')
      label.textContent = i18n.t('notice.copied')
      amount.className = 'notice-count'
      amount.textContent = i18n.plural('notice.chars', count)
      // Over a lasting notice the copy keeps its width and its line, so the tabs beside it do not move
      const box = element.getBoundingClientRect()
      const held = full.length > 0 ? box.width : 0
      element.classList.toggle('lasting', held > 0)
      if (held > 0) {
        element.style.minWidth = `${held}px`
        // A copy over the compact form leaves nothing in the flow: the height keeps the line drawn
        element.style.minHeight = `${box.height}px`
      }
      // The compact form is too narrow for the copy: it shows over the end of the strip, out of the flow,
      // at the place and with the clear room it has over the full form
      if (held > 0 && isCompact()) {
        cover(Math.max(0, fullWidth - box.width))
        const over = document.createElement('span')
        over.className = 'notice-over'
        over.append(label, amount)
        element.replaceChildren(over)
      } else element.replaceChildren(label, amount)
      clearTimeout(timer)
      timer = setTimeout(showLasting, VISIBLE_MS)
    },
    // Empty clears it; while a copy shows, it takes its place when the copy goes. `small` is the compact
    // form, shown when the full one would leave the tabs too little room
    setLasting(nodes: readonly Node[], small: readonly Node[] = []) {
      full = nodes
      compact = small
      if (timer === undefined) showLasting()
    },
  }
}

export type Notice = ReturnType<typeof createNotice>
