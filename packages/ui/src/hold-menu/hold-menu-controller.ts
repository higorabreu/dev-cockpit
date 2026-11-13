import {
  commitSwitcher,
  createHoldGesture,
  createHoldMenu,
  type Direction,
  type HoldMenuState,
  type MenuCategory,
  type MenuItem,
  navigate,
  openSwitcher,
  release,
  type Scheduler,
  type SwitcherState,
  select,
  stepSwitcher,
  type Translate,
} from '@dck/core'
import { inputGate } from '../platform/input-gate.ts'
import { type MenuMarkup, switcherMarkup, wheelMarkup } from './menu-view.ts'

export interface MenuTab {
  readonly id: string
  readonly label: string
  readonly current: boolean
}

export interface HoldMenuActions {
  categories(): readonly MenuCategory[]
  // Most recent to oldest
  tabs(): readonly MenuTab[]
  run(categoryId: string, item: MenuItem): void
  switchTo(tabId: string): void
  // Key that opens the menu while held; comes from settings and can change while the app is open
  triggerCode(): string
}

export interface HoldMenuElements {
  readonly scrim: HTMLElement
  readonly card: HTMLElement
  readonly hint: HTMLElement
  readonly bar: HTMLElement
}

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
}

type Mode =
  | { kind: 'closed' }
  | { kind: 'wheel'; menu: HoldMenuState }
  | {
      kind: 'switcher'
      switcher: SwitcherState
      tabs: readonly MenuTab[]
    }

const consume = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

export function createHoldMenuController(
  elements: HoldMenuElements,
  actions: HoldMenuActions,
  scheduler: Scheduler,
  t: Translate,
) {
  let mode: Mode = { kind: 'closed' }

  const gesture = createHoldGesture({
    scheduler,
    onOpen() {
      if (mode.kind === 'closed')
        mode = { kind: 'wheel', menu: createHoldMenu(actions.categories()) }
      draw()
    },
  })

  function paint(markup: MenuMarkup) {
    elements.card.className = markup.mode
    elements.card.innerHTML = markup.card
    elements.hint.innerHTML = markup.hint
    elements.scrim.classList.add('open')
    // The hint sits on the tab bar row, centered with it
    const box = elements.bar.getBoundingClientRect()
    elements.hint.style.top = `${Math.round(box.top + (box.height - elements.hint.offsetHeight) / 2)}px`
  }

  function draw() {
    if (mode.kind === 'wheel') paint(wheelMarkup(mode.menu, t))
    if (mode.kind === 'switcher') {
      const { switcher, tabs } = mode
      const chips = switcher.order.map((id) => {
        const tab = tabs.find((entry) => entry.id === id)
        return { label: tab?.label ?? id, note: tab?.current ? t('menu.switcher.current') : '' }
      })
      paint(switcherMarkup(chips, switcher.index, t))
    }
  }

  function close() {
    mode = { kind: 'closed' }
    elements.scrim.classList.remove('open')
  }

  function stepTabs(direction: 1 | -1) {
    if (mode.kind !== 'switcher') {
      const tabs = actions.tabs()
      if (tabs.length === 0) return
      mode = { kind: 'switcher', tabs, switcher: openSwitcher(tabs.map((tab) => tab.id)) }
    } else {
      mode = { ...mode, switcher: stepSwitcher(mode.switcher, direction) }
    }
    draw()
  }

  function commit() {
    const current = mode
    close()
    if (current.kind === 'switcher') {
      actions.switchTo(commitSwitcher(current.switcher))
    } else if (current.kind === 'wheel') {
      const result = release(current.menu)
      if (result.type === 'execute') actions.run(result.categoryId, result.item)
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (inputGate.blocked) return
    if (event.code === actions.triggerCode()) {
      if (!event.repeat) gesture.press()
      return
    }
    if (!gesture.isHeld()) return
    if (event.key === 'Escape' && gesture.isOpen()) {
      consume(event)
      gesture.cancel()
      close()
      return
    }
    if (event.code === 'Space') {
      consume(event)
      stepTabs(event.shiftKey ? -1 : 1)
      gesture.openNow()
      return
    }
    const direction = ARROWS[event.key]
    if (direction) {
      if (!gesture.arrow()) return
      consume(event)
      if (mode.kind === 'switcher') stepTabs(direction === 'left' || direction === 'up' ? -1 : 1)
      else if (mode.kind === 'wheel') {
        mode = { ...mode, menu: navigate(mode.menu, direction) }
        draw()
      }
      return
    }
    gesture.otherKey()
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.code !== actions.triggerCode()) return
    if (gesture.release()) commit()
    else close()
  }

  function onPointer(event: Event) {
    if (mode.kind !== 'wheel' || !(event.target instanceof Element)) return
    const sector = event.target.closest<HTMLElement>('[data-category]')
    const row = event.target.closest<HTMLElement>('[data-item]')
    if (sector) mode = { ...mode, menu: select(mode.menu, Number(sector.dataset.category)) }
    else if (row) {
      mode = { ...mode, menu: select(mode.menu, mode.menu.category, Number(row.dataset.item)) }
    } else return
    if (event.type === 'click') commit()
    else draw()
  }

  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  // A click while the trigger is down is Ctrl+click on a link, not the start of the menu
  window.addEventListener('mousedown', () => gesture.otherKey(), true)
  window.addEventListener('blur', () => {
    gesture.cancel()
    close()
  })
  elements.card.addEventListener('mouseover', onPointer)
  elements.card.addEventListener('click', onPointer)
}
