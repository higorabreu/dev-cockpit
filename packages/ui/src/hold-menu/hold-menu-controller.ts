import {
  createHoldGesture,
  createHoldMenu,
  currentCategory,
  type Direction,
  type HoldMenuState,
  type MenuCategory,
  type MenuItem,
  navigate,
  release,
  type Scheduler,
  select,
  selectedIndex,
  type Translate,
  triggerButton,
} from '@dck/core'
import { inputGate } from '../platform/input-gate.ts'
import {
  centeredLayout,
  followSelection,
  listBand,
  type Pin,
  type Placement,
  placeWheel,
  type Room,
  type WheelLayout,
} from './list-fit.ts'
import { type MenuMarkup, wheelMarkup } from './menu-view.ts'
import { createPointerIntent } from './pointer-intent.ts'

// Space the list keeps from the window's top edge and from the tab bar, in CSS pixels
const EDGE = 8
// Measuring settles the wheel and its rows in three repaints at most; the fourth pass is a guard
const FIT_PASSES = 4
// Wheel travel that moves the selection one row: a mouse notch (about 100 pixels) moves one row, not
// several, so the selection stays precise; a touchpad's small deltas add up to it
const WHEEL_STEP = 40

export interface HoldMenuActions {
  categories(): readonly MenuCategory[]
  run(categoryId: string, item: MenuItem): void
  // Key (KeyboardEvent.code) or mouse button (`Mouse1`) that opens the menu while held; comes from
  // settings and can change while the app is open
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

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])

type Mode = { kind: 'closed' } | { kind: 'wheel'; menu: HoldMenuState }

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
  const pointer = createPointerIntent()
  // Per category: how many rows fit on its side of the wheel, the first one on screen and where the
  // wheel sat
  const rowsFit = new Map<number, number>()
  const firstRow = new Map<number, number>()
  const layouts = new Map<number, WheelLayout>()
  // Where the wheel is on screen, kept while the pointer moves the selection
  let shown: Pin | undefined
  let wheelTravel = 0

  const gesture = createHoldGesture({
    scheduler,
    onOpen() {
      if (mode.kind === 'closed') {
        mode = { kind: 'wheel', menu: createHoldMenu(actions.categories()) }
        // The window may have changed size since the last time
        rowsFit.clear()
        firstRow.clear()
        layouts.clear()
        shown = undefined
        wheelTravel = 0
      }
      pointer.keysTakeOver()
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

  const band = () => listBand(elements.bar.getBoundingClientRect(), window.innerHeight, EDGE)
  const room = (): Room => ({ ...band(), left: EDGE, right: window.innerWidth - EDGE })

  function place(layout: WheelLayout) {
    elements.card.style.removeProperty('max-height')
    elements.card.style.setProperty('--wheel', `${layout.size}px`)
    elements.card.style.top = `${layout.top}px`
    elements.card.style.left = `${layout.left}px`
  }

  // The wheel slides between places only once it is on screen, never from where the last opening left it
  function settle() {
    if (elements.card.dataset.placed !== undefined) return
    void elements.card.offsetTop
    elements.card.dataset.placed = ''
  }

  // Where the wheel goes and the rows its list shows, or undefined when there is nothing to measure
  function measureFit(
    menu: HoldMenuState,
    rows: number,
    total: number,
    pinned: Pin | undefined,
  ): Placement | undefined {
    const list = elements.card.querySelector<HTMLElement>('.list')
    const shown = list?.querySelectorAll<HTMLElement>('.it:not(.gone)')
    const first = shown?.[0]
    const last = shown?.[shown.length - 1]
    if (!list || !shown || !first || !last) return undefined
    const pitch =
      shown.length > 1
        ? (last.offsetTop - first.offsetTop) / (shown.length - 1)
        : first.offsetHeight
    if (pitch <= 0) return undefined
    let cues = 0
    for (const cue of list.querySelectorAll<HTMLElement>('.cue')) cues += cue.offsetHeight
    const measure = { total, rows, height: list.offsetHeight, pitch, cues, width: list.offsetWidth }
    return placeWheel(menu.category, menu.categories.length, room(), measure, pinned)
  }

  const sameLayout = (a: WheelLayout, b: WheelLayout) =>
    a.size === b.size &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.overlap - b.overlap) < 0.5

  // `still` keeps the wheel where it is, for a selection the pointer made
  function drawWheel(menu: HoldMenuState, still: boolean) {
    const category = menu.category
    const total = currentCategory(menu)?.items.length ?? 0
    const pinned = still ? shown : undefined
    let rows = Math.min(rowsFit.get(category) ?? total, total)
    const start = layouts.get(category) ?? centeredLayout(room())
    let layout = pinned === undefined ? start : { ...start, ...pinned }
    for (let pass = 1; ; pass++) {
      const shown = followSelection(total, selectedIndex(menu), rows, firstRow.get(category))
      paint(wheelMarkup(menu, t, shown, layout, gesture.isSticky() ? 'click' : 'hold'))
      place(layout)
      const fit = pass < FIT_PASSES ? measureFit(menu, rows, total, pinned) : undefined
      if (fit === undefined || (fit.rows === rows && sameLayout(fit.layout, layout))) {
        firstRow.set(category, shown.start)
        break
      }
      rows = fit.rows
      layout = fit.layout
    }
    rowsFit.set(category, rows)
    layouts.set(category, layout)
    shown = { top: layout.top, left: layout.left }
    settle()
  }

  function draw(still = false) {
    if (mode.kind === 'wheel') drawWheel(mode.menu, still)
  }

  function close() {
    gesture.cancel()
    mode = { kind: 'closed' }
    elements.scrim.classList.remove('open')
    delete elements.card.dataset.placed
  }

  function commit() {
    const current = mode
    close()
    if (current.kind !== 'wheel') return
    const result = release(current.menu)
    if (result.type === 'execute') actions.run(result.categoryId, result.item)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (inputGate.blocked) return
    if (event.code === actions.triggerCode()) {
      if (!event.repeat) gesture.press()
      return
    }
    if (!gesture.isHeld() && !gesture.isSticky()) return
    if (event.key === 'Escape' && gesture.isOpen()) {
      consume(event)
      close()
      return
    }
    const direction = ARROWS[event.key]
    if (direction) {
      if (!gesture.arrow()) return
      consume(event)
      if (mode.kind === 'wheel') {
        mode = { ...mode, menu: navigate(mode.menu, direction) }
        pointer.keysTakeOver()
        draw()
      }
      return
    }
    if (gesture.isSticky()) return stickyKey(event)
    gesture.otherKey()
  }

  // Open after a click of a mouse trigger: Enter runs the selected row; a key that writes closes the menu
  // and goes on to the terminal, so nothing is typed under it. A modifier alone leaves it open
  function stickyKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      consume(event)
      commit()
      return
    }
    if (!MODIFIER_KEYS.has(event.key)) close()
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.code !== actions.triggerCode()) return
    if (gesture.release()) commit()
    else close()
  }

  // Selects a row of the open list without running it; the window follows, as with the arrows
  function selectRow(index: number) {
    if (mode.kind !== 'wheel') return
    const menu = mode.menu
    const total = currentCategory(menu)?.items.length ?? 0
    const next = Math.min(Math.max(index, 0), total - 1)
    if (total === 0 || next === selectedIndex(menu)) return
    mode = { ...mode, menu: select(menu, menu.category, next) }
    pointer.keysTakeOver()
    draw(true)
  }

  function onWheel(event: WheelEvent) {
    if (mode.kind !== 'wheel' || !(event.target instanceof Element)) return
    if (!event.target.closest('.list')) return
    consume(event)
    wheelTravel +=
      event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * WHEEL_STEP
    if (Math.abs(wheelTravel) < WHEEL_STEP) return
    const step = Math.sign(wheelTravel)
    wheelTravel = 0
    selectRow(selectedIndex(mode.menu) + step)
  }

  function onPointer(event: MouseEvent) {
    if (mode.kind !== 'wheel' || !(event.target instanceof Element)) return
    const click = event.type === 'click'
    const cue = event.target.closest<HTMLElement>('[data-reveal]')
    if (cue) {
      if (click) selectRow(Number(cue.dataset.reveal))
      return
    }
    if (!click && !pointer.moved(event.clientX, event.clientY)) return
    const sector = event.target.closest<HTMLElement>('[data-category]')
    const row = event.target.closest<HTMLElement>('[data-item]')
    const current = mode.menu
    let next: HoldMenuState
    if (sector) next = select(current, Number(sector.dataset.category))
    else if (row) next = select(current, current.category, Number(row.dataset.item))
    else return
    mode = { ...mode, menu: next }
    if (click) commit()
    // Redrawn only when the selection changes, not on every move inside a sector
    else if (next.category !== current.category || selectedIndex(next) !== selectedIndex(current))
      draw(true)
  }

  // A mouse button that is the trigger is the menu's alone: no paste, no click for a program in the
  // terminal, no back or forward. While Settings records a key it is left to the recorder
  const isTrigger = (event: MouseEvent) =>
    !inputGate.blocked && event.button === triggerButton(actions.triggerCode())

  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  const offCard = (event: Event) =>
    mode.kind !== 'closed' &&
    !(event.target instanceof Node && elements.card.contains(event.target))
  // A click while the trigger is down is Ctrl+click on a link, not the start of the menu; held a little
  // longer, the menu opened first, and a click off its card closes it and still reaches the terminal
  window.addEventListener(
    'mousedown',
    (event) => {
      if (isTrigger(event)) {
        consume(event)
        // A second click of the button closes the menu its first click left open
        if (!gesture.press()) close()
        return
      }
      gesture.otherKey()
      if (!offCard(event)) return
      close()
    },
    true,
  )
  // Released, the button runs the selected row, as the key does; a quick click leaves the menu open
  window.addEventListener(
    'mouseup',
    (event) => {
      if (!isTrigger(event)) return
      consume(event)
      const outcome = gesture.releaseButton()
      if (outcome === 'run') commit()
      else if (outcome === 'close') close()
    },
    true,
  )
  for (const type of ['auxclick', 'click', 'contextmenu'] as const)
    window.addEventListener(type, (event) => isTrigger(event) && consume(event), true)
  // The scrim lets the pointer through to the terminal, so its link stays found; the wheel stops there
  window.addEventListener('wheel', (event) => offCard(event) && consume(event), {
    capture: true,
    passive: false,
  })
  window.addEventListener('blur', close)
  elements.card.addEventListener('mousemove', onPointer)
  elements.card.addEventListener('click', onPointer)
  elements.card.addEventListener('wheel', onWheel, { passive: false })
  // A press on the card only picks or moves the list, so it never takes the focus from the terminal
  elements.card.addEventListener('mousedown', (event) => event.preventDefault())
}
