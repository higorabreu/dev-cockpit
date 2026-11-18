import type { Translator } from '@dck/core'
import { trapFocus } from '../kit/focus-trap.ts'
import { h } from '../panel/dom.ts'

export interface QuitCardDeps {
  readonly i18n: Pick<Translator, 't' | 'plural'>
  // The quit key as the keyboard writes it (⌘Q), for the Quit button's tooltip
  readonly quitKey: string
  answer(quit: boolean): void
  // Before the card shows: a menu or the hold menu open under it would keep its keys
  closeOthers(): void
  // Gives the keys back to the terminal when the cockpit stays open
  done(): void
}

// Keys that press the focused button; every other key stays from the cockpit and the terminal
const PRESS_KEYS = new Set(['Enter', ' '])

// "Quit Dev Cockpit?" while a tab runs a program. Cancel has the focus: on a Mac the action that loses
// work is not the default. Escape cancels; the host quits on a second ⌘Q
export function createQuitCard(element: HTMLElement, deps: QuitCardDeps) {
  const { i18n } = deps
  let running = 0
  const isOpen = () => !element.hidden

  function close(quit: boolean) {
    if (!isOpen()) return
    element.hidden = true
    element.replaceChildren()
    deps.answer(quit)
    if (!quit) deps.done()
  }

  function render() {
    const cancel = h(
      'button',
      { type: 'button', class: 'vbtn', 'data-tip-key': 'Esc', 'data-focus': 'quit-cancel' },
      i18n.t('quit.cancel'),
    )
    const quit = h(
      'button',
      { type: 'button', class: 'vbtn', 'data-tip-key': deps.quitKey, 'data-focus': 'quit-confirm' },
      i18n.t('quit.confirm'),
    )
    cancel.addEventListener('click', () => close(false))
    quit.addEventListener('click', () => close(true))
    element.replaceChildren(
      h(
        'div',
        { class: 'quit-card' },
        h('h2', { id: 'quit-title', class: 'quit-title' }, i18n.t('quit.title')),
        h('p', { id: 'quit-text', class: 'quit-text' }, i18n.plural('quit.running', running)),
        h('div', { class: 'quit-actions' }, cancel, quit),
      ),
    )
    return cancel
  }

  // In the capture phase and created before the cockpit's keys, so a key meant for them never acts
  // under the card. Nothing but Escape is prevented: a Mac's ⌘Q must still reach the app menu
  window.addEventListener(
    'keydown',
    (event) => {
      if (!isOpen()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close(false)
        return
      }
      const plain = !event.ctrlKey && !event.altKey && !event.metaKey
      if (plain && event.key === 'Tab') trapFocus(element, event)
      if (plain && PRESS_KEYS.has(event.key)) return
      // Tab still moves the focus: stopping the event leaves its default alone
      event.stopImmediatePropagation()
    },
    true,
  )
  // A click beside the card keeps the focus on its buttons
  element.addEventListener('mousedown', (event) => {
    if (event.target === element) event.preventDefault()
  })

  return {
    isOpen,
    // The host asks; it asks no more until the answer, and a second ⌘Q quits without asking
    ask(count: number) {
      running = count
      deps.closeOthers()
      element.hidden = false
      render().focus()
    },
    retranslate() {
      if (!isOpen()) return
      const focused = document.activeElement
      const name = focused instanceof HTMLElement ? focused.dataset.focus : undefined
      render()
      element.querySelector<HTMLElement>(`[data-focus="${name ?? 'quit-cancel'}"]`)?.focus()
    },
  }
}
