import type { AttentionKind, TabsState, Translate } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import { attentionMark, REVIEW_KEY, reviewMark, strongestMark } from './attention-mark.ts'

export interface TabBarCallbacks {
  activate(id: string): void
  contextMenu(id: string, x: number, y: number): void
  reorder(ids: readonly string[]): void
  // The strongest mark among tabs outside the visible area of the bar
  hiddenAttention(kind: AttentionKind | undefined): void
}

const FADE_PX = 24
const SPLIT_GLYPH = '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/>'

export function createTabBar(container: HTMLElement, callbacks: TabBarCallbacks, t: Translate) {
  let dragging: HTMLElement | undefined
  let lastActive: string | undefined
  let hiddenAttention: AttentionKind | undefined

  const idOf = (button: Element) => (button as HTMLElement).dataset.id ?? ''
  const currentOrder = () => [...container.children].map(idOf)

  function hiddenMark(): AttentionKind | undefined {
    const view = container.getBoundingClientRect()
    // Only attention marks count; an open review asks nothing of the user
    const hidden = [...container.querySelectorAll<HTMLElement>('.pip:not(.review)')].filter(
      (pip) => {
        const box = pip.getBoundingClientRect()
        return box.right > view.right + 1 || box.left < view.left - 1
      },
    )
    return strongestMark(hidden.map((pip) => pip.dataset.kind as AttentionKind))
  }

  // Faded only on the edge that has more tabs, and the notice for a tab that finished out of sight
  function syncEdges() {
    const start = container.scrollLeft > 1
    const end = container.scrollLeft + container.clientWidth < container.scrollWidth - 1
    if (start && end) container.dataset.fade = 'both'
    else if (start) container.dataset.fade = 'start'
    else if (end) container.dataset.fade = 'end'
    else delete container.dataset.fade
    const hidden = hiddenMark()
    if (hidden === hiddenAttention) return
    hiddenAttention = hidden
    callbacks.hiddenAttention(hidden)
  }

  container.style.scrollPaddingInline = `${FADE_PX}px`
  container.addEventListener('scroll', syncEdges, { passive: true })
  new ResizeObserver(syncEdges).observe(container)
  // A roda vertical rola a barra na horizontal
  container.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      container.scrollLeft += event.deltaY
      event.preventDefault()
    },
    { passive: false },
  )

  return {
    // `reviews` are the tabs whose review is open but hidden behind their terminal
    render(
      state: TabsState,
      marks: ReadonlyMap<string, AttentionKind> = new Map(),
      reviews: ReadonlySet<string> = new Set(),
    ) {
      // Replacing the children resets the scroll; without saving, the watcher's redraw undoes the user's scroll
      const scrolled = container.scrollLeft
      container.replaceChildren(
        ...state.tabs.map((tab) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'tab'
          button.dataset.id = tab.id
          button.draggable = true
          button.setAttribute('role', 'tab')
          button.setAttribute('aria-selected', String(tab.id === state.activeId))
          const label = document.createElement('span')
          label.className = 'tab-label'
          label.textContent = tab.label
          button.append(label)
          const kind = marks.get(tab.id)
          if (kind) {
            const mark = attentionMark(kind, t)
            const pip = document.createElement('span')
            pip.className = mark.className
            pip.dataset.kind = kind
            pip.dataset.tip = mark.label
            pip.setAttribute('role', 'img')
            pip.setAttribute('aria-label', mark.label)
            button.append(pip)
          }
          if (reviews.has(tab.id)) {
            const mark = reviewMark(t)
            button.append(
              h(
                'span',
                {
                  class: mark.className,
                  role: 'img',
                  'aria-label': mark.label,
                  'data-tip': mark.label,
                  'data-tip-key': REVIEW_KEY,
                },
                icon(SPLIT_GLYPH, 12),
              ),
            )
          }
          button.addEventListener('click', () => callbacks.activate(tab.id))
          button.addEventListener('contextmenu', (event) => {
            event.preventDefault()
            callbacks.contextMenu(tab.id, event.clientX, event.clientY)
          })
          button.addEventListener('dragstart', (event) => {
            dragging = button
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
            button.classList.add('dragging')
          })
          button.addEventListener('dragover', (event) => {
            if (!dragging || dragging === button) return
            event.preventDefault()
            const box = button.getBoundingClientRect()
            container.insertBefore(
              dragging,
              event.clientX > box.left + box.width / 2 ? button.nextSibling : button,
            )
          })
          button.addEventListener('dragend', () => {
            button.classList.remove('dragging')
            dragging = undefined
            callbacks.reorder(currentOrder())
          })
          return button
        }),
      )
      container.scrollLeft = scrolled
      if (state.activeId !== lastActive) {
        lastActive = state.activeId
        container
          .querySelector('[aria-selected="true"]')
          ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      }
      syncEdges()
    },
  }
}
