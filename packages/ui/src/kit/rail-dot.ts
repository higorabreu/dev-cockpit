import type { Translator } from '@dck/core'
import { h } from '../panel/dom.ts'

// A rail button gets a dot while something waits for the user; the tooltip stays the title, and only the
// screen reader hears how many
export function showRailDot(
  button: HTMLElement,
  i18n: Translator,
  title: string,
  waiting: number,
): void {
  button.setAttribute(
    'aria-label',
    waiting > 0 ? i18n.plural('rail.waiting', waiting, { title }) : title,
  )
  button.setAttribute('data-tip', title)
  const dot = button.querySelector(':scope > .rail-dot')
  if (waiting <= 0) dot?.remove()
  else if (!dot) button.append(h('span', { class: 'rail-dot', 'aria-hidden': 'true' }))
}
