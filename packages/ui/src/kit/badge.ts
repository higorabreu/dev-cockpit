import { formatBadge, type Translate } from '@dck/core'
import { h } from '../panel/dom.ts'

// A count on a rail button, with the text that says what it counts
export interface RailBadge {
  readonly count: number
  readonly detail: string
}

// The pill holds at most "9+"; the tooltip and the label carry the exact count, so the pill is hidden from
// the screen reader
export function showBadge(
  button: HTMLElement,
  t: Translate,
  title: string,
  badge: RailBadge | undefined,
): void {
  const text = badge === undefined ? undefined : formatBadge(badge.count)
  const label = badge && text ? t('rail.badge', { title, detail: badge.detail }) : title
  button.setAttribute('aria-label', label)
  button.setAttribute('data-tip', label)
  const pill = button.querySelector(':scope > .badge')
  if (text === undefined) pill?.remove()
  else if (pill) pill.textContent = text
  else button.append(h('span', { class: 'badge', 'aria-hidden': 'true' }, text))
}
