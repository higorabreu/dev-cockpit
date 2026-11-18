import { type AttentionKind, MAX_TAB_NAME, type TabsState, type Translate } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import { attentionMark, reviewMark } from './attention-mark.ts'

export interface TabBarCallbacks {
  activate(id: string): void
  contextMenu(id: string, x: number, y: number): void
  // Closes the tab as its menu item and the close key do
  close(id: string): void
  // False while the middle button opens the hold menu (D69): it keeps that meaning on a tab
  middleClickCloses(): boolean
  reorder(ids: readonly string[]): void
  // The name typed for a tab, or undefined when the edit was cancelled
  rename(id: string, name: string | undefined): void
}

const FADE_PX = 24
// Two clicks on the same tab this close together are a double-click
const DOUBLE_CLICK_MS = 500
const SPLIT_GLYPH = '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/>'

export function createTabBar(container: HTMLElement, callbacks: TabBarCallbacks, t: Translate) {
  let dragging: HTMLElement | undefined
  let lastActive: string | undefined
  let last: Parameters<typeof render> = [{ tabs: [], activeId: undefined, recent: [] }]
  // While a name is being typed the bar does not redraw: a redraw would take the field away
  let editing: { readonly id: string; finish(save: boolean): void } | undefined
  let lastClick: { readonly id: string; readonly at: number } | undefined

  const idOf = (button: Element) => (button as HTMLElement).dataset.id ?? ''
  const currentOrder = () => [...container.children].map(idOf)

  // Faded only on the edge that has more tabs
  function syncEdges() {
    const start = container.scrollLeft > 1
    const end = container.scrollLeft + container.clientWidth < container.scrollWidth - 1
    if (start && end) container.dataset.fade = 'both'
    else if (start) container.dataset.fade = 'start'
    else if (end) container.dataset.fade = 'end'
    else delete container.dataset.fade
  }

  container.style.scrollPaddingInline = `${FADE_PX}px`
  container.addEventListener('scroll', syncEdges, { passive: true })
  new ResizeObserver(syncEdges).observe(container)
  // The vertical wheel scrolls the bar sideways
  container.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      container.scrollLeft += event.deltaY
      event.preventDefault()
    },
    { passive: false },
  )

  // `reviews` are the tabs whose review is open but hidden behind their terminal
  function render(
    state: TabsState,
    marks: ReadonlyMap<string, AttentionKind> = new Map(),
    reviews: ReadonlySet<string> = new Set(),
  ) {
    last = [state, marks, reviews]
    if (editing) return
    // Replacing the children resets the scroll; without saving, the watcher's redraw undoes the user's scroll
    const scrolled = container.scrollLeft
    // A redraw keeps what the user had: the focus on a tab, and the active tab in view if it was
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.tab')
    const focusedId = focused && container.contains(focused) ? focused.dataset.id : undefined
    const activeWasShown = activeInView()
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
                // The key that opens and closes the review, asked of the keymap when the tooltip shows
                'data-tip-shortcut': 'review',
              },
              icon(SPLIT_GLYPH, 12),
            ),
          )
        }
        // The first click redraws the bar, so the second lands on a new button and no dblclick comes
        button.addEventListener('click', (event) => {
          const again = lastClick?.id === tab.id && event.timeStamp - lastClick.at < DOUBLE_CLICK_MS
          lastClick = again ? undefined : { id: tab.id, at: event.timeStamp }
          if (again) rename(tab.id)
          else callbacks.activate(tab.id)
        })
        button.addEventListener('contextmenu', (event) => {
          event.preventDefault()
          callbacks.contextMenu(tab.id, event.clientX, event.clientY)
        })
        // The middle button closes the tab, as in a browser. On Linux its release would also paste the
        // selection into the focused terminal, and its press would move the focus or start autoscroll
        for (const type of ['mousedown', 'mouseup'] as const)
          button.addEventListener(type, (event) => {
            if (event.button === 1) event.preventDefault()
          })
        button.addEventListener('auxclick', (event) => {
          if (event.button !== 1) return
          event.preventDefault()
          if (callbacks.middleClickCloses()) callbacks.close(tab.id)
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
    // A mark that widened a tab before it can push the active one under the fade
    if (state.activeId !== lastActive || (activeWasShown && !activeInView())) {
      lastActive = state.activeId
      container
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    }
    if (focusedId) tabOf(focusedId)?.focus()
    syncEdges()
  }

  const tabOf = (id: string) =>
    [...container.querySelectorAll<HTMLElement>('.tab')].find((tab) => tab.dataset.id === id)

  // Clear of the edges that fade, where the bar's own scroll padding keeps the active tab
  function activeInView(): boolean {
    const active = container.querySelector('[aria-selected="true"]')
    if (!active) return false
    const fade = container.dataset.fade
    const start = fade === 'start' || fade === 'both' ? FADE_PX : 0
    const end = fade === 'end' || fade === 'both' ? FADE_PX : 0
    const view = container.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    return box.left >= view.left + start - 1 && box.right <= view.right - end + 1
  }

  // The tab's name turns into a field in place: Enter or a click elsewhere keeps it, Esc leaves it as it was
  function rename(id: string) {
    editing?.finish(true)
    const button = tabOf(id)
    const tab = last[0].tabs.find((entry) => entry.id === id)
    if (!button || !tab) return
    const input = h('input', {
      type: 'text',
      class: 'tab-name',
      value: tab.label,
      maxlength: String(MAX_TAB_NAME),
      placeholder: tab.autoLabel ?? tab.label,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': t('tabs.nameField'),
    })
    const field = h('span', { class: 'tab editing', 'data-id': id }, input)
    if (button.getAttribute('aria-selected') === 'true') field.setAttribute('aria-current', 'true')
    let done = false
    const finish = (save: boolean) => {
      if (done) return
      done = true
      editing = undefined
      const name = input.value
      render(...last)
      callbacks.rename(id, save ? name : undefined)
    }
    editing = { id, finish }
    input.addEventListener('keydown', (event) => {
      // The field keeps its keys: Enter and Esc end the edit, the rest is typing
      event.stopPropagation()
      if (event.key === 'Enter') finish(true)
      else if (event.key === 'Escape') finish(false)
      else return
      event.preventDefault()
    })
    input.addEventListener('blur', () => finish(true))
    button.replaceWith(field)
    field.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    input.focus()
    input.select()
  }

  return { render, rename, isRenaming: () => editing !== undefined }
}
