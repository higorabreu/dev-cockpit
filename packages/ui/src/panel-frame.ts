import type { Translate } from '@dck/core'
import { h, icon } from './panel/dom.ts'

export function closeButton(
  t: Translate,
  onClose: () => void,
  focusId?: string,
): HTMLButtonElement {
  const button = h(
    'button',
    {
      type: 'button',
      class: 'pclose',
      'data-focus': focusId,
      'data-tip': t('panel.close'),
      'data-tip-key': 'Esc',
      'aria-label': t('panel.close'),
    },
    icon('<path d="M6 6l12 12M18 6L6 18"/>', 14),
  )
  button.addEventListener('click', onClose)
  return button
}

export const keyHint = (keys: string, label: string): HTMLElement =>
  h('span', { class: 'pkey' }, h('kbd', { class: 'pk' }, keys), ` ${label}`)

export const hintBar = (...hints: HTMLElement[]): HTMLElement =>
  h('div', { class: 'phint' }, ...hints)
