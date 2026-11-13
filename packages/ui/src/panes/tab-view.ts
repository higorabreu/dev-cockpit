import {
  addPane,
  arrangePanes,
  focusPane,
  PANE_RATIO,
  type PaneKind,
  type PaneLayout,
  paneOfKind,
  removePane,
  setPaneRatio,
  singlePane,
  type Translate,
} from '@dck/core'
import { h } from '../panel/dom.ts'

// What a tab shows in one of its panes
export interface PaneView {
  readonly id: string
  readonly kind: PaneKind
  readonly element: HTMLElement
  focus(): void
}

// The share of the first pane a new split starts with, kept across tabs while the window lives
export interface RatioMemory {
  ratio: number
}

export interface TabViewDeps {
  readonly t: Translate
  readonly memory: RatioMemory
  // Two panes exist but only one fits, or both fit again
  onNarrow?(narrow: boolean): void
}

// The divider is 1px of line between the panes; its grip is wider than what it draws
const DIVIDER = 1
const KEY_STEP = 16

// One tab: its terminal and, beside it, an optional second pane with a divider that resizes by mouse
// and keyboard. Below both minimum widths only the focused pane is shown
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
  let layout: PaneLayout | undefined
  let narrow = false
  let firstWidth = 0
  let frame = 0

  const room = () => element.clientWidth - DIVIDER

  function arrange() {
    if (!layout) return
    const arranged = arrangePanes(layout, element.clientWidth, DIVIDER)
    const shown = new Map(arranged.visible.map((pane) => [pane.id, pane.width]))
    for (const [id, view] of views) {
      const width = shown.get(id)
      view.element.hidden = width === undefined
      view.element.style.flex = width === undefined ? '' : `0 0 ${width}px`
    }
    const split = arranged.visible.length === 2
    divider.hidden = !split
    firstWidth = arranged.visible[0]?.width ?? 0
    if (split) {
      // The review's share, within what the minimum widths allow at this width
      const share = (ratio: number) => {
        const first = arrangePanes(
          setPaneRatio(layout as PaneLayout, ratio),
          element.clientWidth,
          DIVIDER,
        )
        return Math.round(100 - ((first.visible[0]?.width ?? 0) / Math.max(1, room())) * 100)
      }
      divider.setAttribute('aria-valuenow', String(share(layout.ratio)))
      divider.setAttribute('aria-valuemin', String(share(PANE_RATIO.max)))
      divider.setAttribute('aria-valuemax', String(share(PANE_RATIO.min)))
    }
    if (arranged.narrow !== narrow) {
      narrow = arranged.narrow
      element.toggleAttribute('data-narrow', narrow)
      deps.onNarrow?.(narrow)
    }
  }

  function setRatio(ratio: number) {
    if (!layout) return
    layout = setPaneRatio(layout, ratio)
    deps.memory.ratio = layout.ratio
    arrange()
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
        if (narrow) arrange()
      }
    }
  })

  divider.addEventListener('pointerdown', (event) => {
    divider.setPointerCapture(event.pointerId)
    divider.dataset.drag = 'true'
    const startX = event.clientX
    const startWidth = firstWidth
    const move = (moved: PointerEvent) =>
      setRatio((startWidth + moved.clientX - startX) / Math.max(1, room()))
    const stop = () => {
      delete divider.dataset.drag
      divider.removeEventListener('pointermove', move)
      divider.removeEventListener('pointerup', stop)
    }
    divider.addEventListener('pointermove', move)
    divider.addEventListener('pointerup', stop)
  })
  divider.addEventListener('keydown', (event) => {
    const { key } = event
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      setRatio((firstWidth + (key === 'ArrowLeft' ? -KEY_STEP : KEY_STEP)) / Math.max(1, room()))
    } else if (key === 'Home') setRatio(PANE_RATIO.min)
    else if (key === 'End') setRatio(PANE_RATIO.max)
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  const translate = () => divider.setAttribute('aria-label', deps.t('review.a11y.divider'))
  translate()

  return {
    element,
    // The tab's own terminal, the first pane; its element is already inside this view
    setTerminal(view: PaneView) {
      views.set(view.id, view)
      layout = { ...singlePane(view), ratio: deps.memory.ratio }
      arrange()
    },
    open(view: PaneView) {
      if (!layout) return
      if (!views.has(view.id)) {
        views.set(view.id, view)
        element.append(divider, view.element)
      }
      layout = addPane(setPaneRatio(layout, deps.memory.ratio), view)
      arrange()
      view.focus()
    },
    close(id: string) {
      const view = views.get(id)
      if (!layout || !view || layout.panes[0]?.id === id) return
      layout = removePane(layout, id)
      views.delete(id)
      view.element.remove()
      divider.remove()
      arrange()
      this.focusCurrent()
    },
    focus(id: string) {
      if (!layout) return
      layout = focusPane(layout, id)
      arrange()
      views.get(id)?.focus()
    },
    focusCurrent() {
      if (layout) views.get(layout.focused)?.focus()
    },
    paneOf: (kind: PaneKind) => (layout ? paneOfKind(layout, kind) : undefined),
    focused: () => layout?.focused,
    isShown: (id: string) => views.get(id)?.element.hidden === false,
    isNarrow: () => narrow,
    setActive(active: boolean) {
      element.classList.toggle('active', active)
      if (active) arrange()
    },
    retranslate: translate,
    dispose() {
      observer.disconnect()
      cancelAnimationFrame(frame)
      element.remove()
    },
  }
}

export type TabView = ReturnType<typeof createTabView>
