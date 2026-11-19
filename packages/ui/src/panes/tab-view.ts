import {
  addPane,
  arrangePanes,
  focusPane,
  type Orientation,
  PANE_RATIO,
  type PaneArrangement,
  type PaneGrid,
  type PaneKind,
  type PaneLayout,
  paneOfKind,
  removePane,
  type SplitPreference,
  setPaneRatio,
  singlePane,
  type TabShape,
  type Translate,
} from '@dck/core'
import { h } from '../panel/dom.ts'

// What a tab shows in one of its panes
export interface PaneView {
  readonly id: string
  readonly kind: PaneKind
  readonly element: HTMLElement
  focus(): void
  // Its text grid, when it can be measured; the orientation rule falls back to a usual one
  grid?(): PaneGrid | undefined
}

// How the user wants a split shown and the share kept for each orientation
export interface SplitPreferences {
  readonly preference: SplitPreference
  readonly ratios: Readonly<Record<Orientation, number>>
}

export interface TabViewDeps {
  readonly t: Translate
  preferences(): SplitPreferences
  // The divider moved: the share of the first pane in that orientation
  onRatio?(orientation: Orientation, ratio: number): void
  // How two panes are shown changed: an orientation, or undefined while only one fits (narrow) or exists
  onArrange?(orientation: Orientation | undefined, narrow: boolean): void
  // Which panes are on screen changed (a pane opened or closed, or a narrow tab switched panes)
  onShownChange?(): void
  // Whether a pane opening or closing slides, as the side panel does; false with reduced motion
  animate?(): boolean
  // A slide ended: the terminal fits once, having kept its grid while the panes moved (as D67's drag)
  onMoved?(): void
}

// The divider is 1px of line between the panes; its grip is wider than what it draws
const DIVIDER = 1
const KEY_STEP = 16

// Until a pane is on screen its grid cannot be measured: a 16px terminal and the review's 12px diff
const USUAL_GRIDS: Readonly<Record<PaneKind, PaneGrid>> = {
  terminal: { cellWidth: 9.6, cellHeight: 19, frameWidth: 24, frameHeight: 16 },
  review: { cellWidth: 7.2, cellHeight: 20, frameWidth: 122, frameHeight: 72 },
}

// The motion's length when the style does not give one, and the margin before a slide is ended by hand
const MOTION_MS = 170
const MOTION_SLACK_MS = 200

// The token is written in milliseconds, but a computed style may give it back in seconds (0.17s)
export function motionMs(element: HTMLElement): number {
  const text = getComputedStyle(element).getPropertyValue('--motion-normal').trim()
  const value = Number.parseFloat(text)
  if (!Number.isFinite(value)) return MOTION_MS
  return text.endsWith('ms') ? value : value * 1000
}

const KEYS: Readonly<Record<Orientation, { readonly back: string; readonly forward: string }>> = {
  side: { back: 'ArrowLeft', forward: 'ArrowRight' },
  stacked: { back: 'ArrowUp', forward: 'ArrowDown' },
}

// One tab: its terminal and an optional second pane, side by side or stacked, with a divider that
// resizes by mouse and keyboard. When neither orientation fits only the focused pane is shown
export function createTabView(host: HTMLElement, deps: TabViewDeps) {
  const element = h('div', { class: 'tabview' })
  host.append(element)
  const divider = h('div', {
    class: 'pane-divider',
    role: 'separator',
    tabindex: '0',
    'aria-orientation': 'vertical',
    hidden: true,
  })
  const views = new Map<string, PaneView>()
  const grids: Record<PaneKind, PaneGrid> = { ...USUAL_GRIDS }
  let layout: PaneLayout | undefined
  let arranged: PaneArrangement = { visible: [], orientation: undefined, narrow: false }
  let firstSize = 0
  let frame = 0
  let shownIds = ''
  let dragging = false
  // The end of the slide under way: the next open or close runs it first, so a slide is never left half done
  let moving: (() => void) | undefined

  function shape(): TabShape {
    for (const view of views.values()) {
      const grid = view.grid?.()
      if (grid) grids[view.kind] = grid
    }
    return { width: element.clientWidth, height: element.clientHeight, divider: DIVIDER, grids }
  }

  const room = () =>
    (arranged.orientation === 'stacked' ? element.clientHeight : element.clientWidth) - DIVIDER

  // The second pane's share, within what the minimums allow at this size
  function describeDivider(current: PaneLayout, orientation: Orientation, tab: TabShape) {
    const share = (ratio: number) => {
      const first = arrangePanes(setPaneRatio(current, orientation, ratio), tab, orientation)
      return Math.round(100 - ((first.visible[0]?.size ?? 0) / Math.max(1, room())) * 100)
    }
    divider.setAttribute('aria-orientation', orientation === 'side' ? 'vertical' : 'horizontal')
    divider.setAttribute(
      'aria-label',
      deps.t(orientation === 'side' ? 'review.a11y.divider' : 'review.a11y.dividerStacked'),
    )
    divider.setAttribute('aria-valuenow', String(share(current.ratios[orientation])))
    divider.setAttribute('aria-valuemin', String(share(PANE_RATIO.max)))
    divider.setAttribute('aria-valuemax', String(share(PANE_RATIO.min)))
  }

  // During a slide the panes keep the motion's sizes; its end lays them out
  function arrange() {
    if (!layout || moving) return
    const tab = shape()
    const before = arranged
    arranged = arrangePanes(layout, tab, deps.preferences().preference)
    const { orientation } = arranged
    const shown = new Map(arranged.visible.map((pane) => [pane.id, pane.size]))
    for (const [id, view] of views) {
      const size = shown.get(id)
      view.element.hidden = size === undefined
      // The sizes come from the whole pixels of clientHeight; shrinking absorbs a fractional box, which
      // would otherwise overflow the document by half a pixel and show the native scrollbar
      view.element.style.flex =
        size === undefined ? '' : orientation === undefined ? '1 1 0' : `0 1 ${size}px`
    }
    if (orientation) element.dataset.orientation = orientation
    else delete element.dataset.orientation
    const visibleIds = arranged.visible.map((pane) => pane.id).join(' ')
    const shownChanged = visibleIds !== shownIds
    shownIds = visibleIds
    divider.hidden = orientation === undefined
    firstSize = arranged.visible[0]?.size ?? 0
    if (orientation) describeDivider(layout, orientation, tab)
    element.toggleAttribute('data-narrow', arranged.narrow)
    if (before.orientation !== orientation || before.narrow !== arranged.narrow) {
      deps.onArrange?.(orientation, arranged.narrow)
    }
    if (shownChanged) deps.onShownChange?.()
  }

  function setRatio(ratio: number) {
    const orientation = arranged.orientation
    if (!layout || !orientation) return
    const next = setPaneRatio(layout, orientation, ratio)
    if (next === layout) return
    const previous = layout
    const before = firstSize
    layout = next
    arrange()
    // Past a pane's minimum the divider does not move, and a share that changes nothing is not kept
    if (firstSize === before) layout = previous
    else deps.onRatio?.(orientation, layout.ratios[orientation])
  }

  // The kept shares, unless a drag is under way: its own share is newer than a save that comes back
  function adopt() {
    if (!layout || dragging) return
    const { ratios } = deps.preferences()
    layout = setPaneRatio(setPaneRatio(layout, 'side', ratios.side), 'stacked', ratios.stacked)
  }

  function settle() {
    const end = moving
    moving = undefined
    end?.()
  }

  // A pane slides between no room and its share while the other takes the rest: open grows `id` from
  // nothing, close shrinks it away. A narrow tab, which shows one pane, slides it over the whole tab. The
  // panes keep their grids meanwhile (`isMoving`); `finish` lays them out for good, then focus follows
  function slide(id: string, opening: boolean, finish: () => void) {
    const pane = views.get(id)
    const first = layout?.panes[0]
    const terminal = first && first.id !== id ? views.get(first.id) : undefined
    if (!pane || !terminal || pane.element.hidden || deps.animate?.() !== true) {
      finish()
      return
    }
    const stacked = arranged.orientation === 'stacked'
    const total = Math.max(0, (stacked ? element.clientHeight : element.clientWidth) - DIVIDER)
    // Shared, each pane has its share as laid out; alone in a narrow tab, the shown one has it all
    const shared = arranged.orientation !== undefined
    const paneShare = shared ? pane.element.style.flex : `0 1 ${total}px`
    const terminalShare = shared ? terminal.element.style.flex : '0 1 0px'
    const [paneFrom, paneTo] = opening ? ['0 1 0px', paneShare] : [paneShare, '0 1 0px']
    const [terminalFrom, terminalTo] = opening
      ? [`0 1 ${total}px`, terminalShare]
      : [terminalShare, `0 1 ${total}px`]
    pane.element.hidden = false
    terminal.element.hidden = false
    pane.element.style.flex = paneFrom
    terminal.element.style.flex = terminalFrom
    // The start is laid out before the transition is turned on, so it animates from there
    void element.offsetWidth
    element.dataset.moving = ''
    pane.element.style.flex = paneTo
    terminal.element.style.flex = terminalTo
    const done = () => {
      if (moving !== end) return
      moving = undefined
      end()
    }
    const end = () => {
      clearTimeout(timer)
      pane.element.removeEventListener('transitionend', onEnd)
      delete element.dataset.moving
      finish()
      deps.onMoved?.()
    }
    const onEnd = (event: TransitionEvent) => {
      if (event.target === pane.element && event.propertyName === 'flex-basis') done()
    }
    pane.element.addEventListener('transitionend', onEnd)
    const timer = setTimeout(done, motionMs(element) + MOTION_SLACK_MS)
    moving = end
  }

  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(arrange)
  })
  observer.observe(element)

  // Clicking or tabbing into a pane makes it the focused one, which is what a narrow tab shows
  element.addEventListener('focusin', (event) => {
    if (!layout) return
    for (const [id, view] of views) {
      if (view.element.contains(event.target as Node) && layout.focused !== id) {
        layout = focusPane(layout, id)
        if (arranged.narrow) arrange()
      }
    }
  })

  divider.addEventListener('pointerdown', (event) => {
    divider.setPointerCapture(event.pointerId)
    divider.dataset.drag = 'true'
    dragging = true
    const stacked = arranged.orientation === 'stacked'
    const start = stacked ? event.clientY : event.clientX
    const startSize = firstSize
    const move = (moved: PointerEvent) =>
      setRatio(
        (startSize + (stacked ? moved.clientY : moved.clientX) - start) / Math.max(1, room()),
      )
    const stop = () => {
      delete divider.dataset.drag
      dragging = false
      divider.removeEventListener('pointermove', move)
      divider.removeEventListener('pointerup', stop)
      divider.removeEventListener('pointercancel', stop)
    }
    divider.addEventListener('pointermove', move)
    divider.addEventListener('pointerup', stop)
    divider.addEventListener('pointercancel', stop)
  })
  divider.addEventListener('keydown', (event) => {
    const orientation = arranged.orientation
    if (!orientation) return
    const { key } = event
    const keys = KEYS[orientation]
    if (key === keys.back || key === keys.forward) {
      setRatio((firstSize + (key === keys.back ? -KEY_STEP : KEY_STEP)) / Math.max(1, room()))
    } else if (key === 'Home') setRatio(PANE_RATIO.min)
    else if (key === 'End') setRatio(PANE_RATIO.max)
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  return {
    element,
    // The tab's own terminal, the first pane; its element is already inside this view
    setTerminal(view: PaneView) {
      views.set(view.id, view)
      layout = singlePane(view, deps.preferences().ratios)
      arrange()
    },
    open(view: PaneView) {
      if (!layout) return
      settle()
      const opened = paneOfKind(layout, view.kind) !== undefined
      if (!views.has(view.id)) {
        views.set(view.id, view)
        element.append(divider, view.element)
      }
      adopt()
      layout = addPane(layout, view)
      arrange()
      const finish = () => {
        arrange()
        view.focus()
      }
      if (opened) finish()
      else slide(view.id, true, finish)
    },
    close(id: string) {
      settle()
      const view = views.get(id)
      if (!layout || !view || layout.panes[0]?.id === id) return
      const focusCurrent = () => this.focusCurrent()
      slide(id, false, () => {
        if (!layout || views.get(id) !== view) return
        layout = removePane(layout, id)
        views.delete(id)
        view.element.remove()
        divider.remove()
        arrange()
        focusCurrent()
      })
    },
    // True while a pane slides: the terminal keeps its grid until it ends
    isMoving: () => moving !== undefined,
    focus(id: string) {
      if (!layout) return
      layout = focusPane(layout, id)
      arrange()
      views.get(id)?.focus()
    },
    focusCurrent() {
      if (layout) views.get(layout.focused)?.focus()
    },
    // The preference or the kept shares changed, or a pane's grid did (the font size)
    relayout() {
      adopt()
      arrange()
    },
    paneOf: (kind: PaneKind) => (layout ? paneOfKind(layout, kind) : undefined),
    focused: () => layout?.focused,
    isShown: (id: string) => views.get(id)?.element.hidden === false,
    isNarrow: () => arranged.narrow,
    orientation: () => arranged.orientation,
    setActive(active: boolean) {
      element.classList.toggle('active', active)
      if (active) arrange()
    },
    retranslate() {
      if (layout && arranged.orientation) describeDivider(layout, arranged.orientation, shape())
    },
    dispose() {
      settle()
      observer.disconnect()
      cancelAnimationFrame(frame)
      element.remove()
    },
  }
}

export type TabView = ReturnType<typeof createTabView>
