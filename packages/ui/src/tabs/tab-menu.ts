import { keys } from '../kit/keys.ts'
import { watchOverflow } from '../kit/scrollbar.ts'
import { h } from '../panel/dom.ts'

export interface MenuAction {
  readonly label: string
  readonly enabled: boolean
  // The shortcut that does the same, shown beside the label as the hold menu shows it
  readonly key?: string
  // A word beside the label in the muted color, such as the folder that tells two files of one name apart
  readonly detail?: string
  run(): void
}

export interface MenuOptions {
  // `end` puts the menu's right edge at x, to line it up with the control that opened it
  readonly align?: 'start' | 'end'
  // A line above the items that says why they are offered; read, never focused
  readonly caption?: string
  // Opened by a click with the focus in the terminal: the first item takes the focus without its ring, as a
  // right click on a tab gives it, since a text field's focus would pass its ring on to the item
  readonly pointer?: boolean
  // Items under a divider that stay in view while a long list above them scrolls (Save, Close file)
  readonly footer?: readonly MenuAction[]
}

// One opening of the menu: closing it does nothing once the menu has been opened again for another use
export interface MenuHandle {
  close(): void
}

// Between the menu and the point or the bar it opens from, and between the menu and the window's edge
const GAP = 6
const EDGE = 4

export interface MenuRequest {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  // Opens above the point by choice; it goes to the other side when only that one has room
  readonly above: boolean
  readonly align?: 'start' | 'end'
}

export interface MenuPlace {
  readonly left: number
  readonly top: number
  // Set when the menu fits neither below nor above: it takes the window's height and its list scrolls
  readonly maxHeight?: number
}

// Where the menu goes: on the side asked when it fits, else on the other one, else over the whole
// window's height, never past its edges
export function placeMenu(
  request: MenuRequest,
  view: { width: number; height: number },
): MenuPlace {
  const { x, y, width, height } = request
  const start = request.align === 'end' ? x - width : x
  const left = Math.max(EDGE, Math.min(start, view.width - width - EDGE))
  const below = y + GAP
  const above = y - GAP - height
  const fitsBelow = below + height <= view.height - EDGE
  const fitsAbove = above >= EDGE
  if (request.above ? fitsAbove : fitsBelow) return { left, top: request.above ? above : below }
  if (request.above ? fitsBelow : fitsAbove) return { left, top: request.above ? below : above }
  return { left, top: EDGE, maxHeight: Math.max(0, view.height - 2 * EDGE) }
}

const STEPS: Record<string, (index: number, count: number) => number> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
}

function menuItem(action: MenuAction, close: () => void): HTMLButtonElement {
  const item = document.createElement('button')
  item.type = 'button'
  item.setAttribute('role', 'menuitem')
  if (action.key === undefined && action.detail === undefined) item.textContent = action.label
  else {
    const label = document.createElement('span')
    label.textContent = action.label
    item.append(label)
    if (action.detail !== undefined) item.append(h('span', { class: 'menu-detail' }, action.detail))
    if (action.key !== undefined) item.append(keys(action.key, 'compact'))
  }
  item.disabled = !action.enabled
  item.addEventListener('click', () => {
    close()
    action.run()
  })
  return item
}

// Small context menu (a tab, a folder in the terminal); closes on outside click or Esc. In a short window
// its list scrolls while the caption and the footer stay
export function createTabMenu(element: HTMLElement) {
  const list = h('div', { class: 'menu-list scroll', role: 'none' })
  const divider = h('div', { class: 'menu-divider', role: 'separator' })
  const footer = h('div', { class: 'menu-footer', role: 'none' })
  watchOverflow(list)
  // Where the focus goes back when the menu closes without running anything else
  let restore: (() => void) | undefined
  let openings = 0

  const close = () => {
    if (element.hidden) return
    element.hidden = true
    const back = restore
    restore = undefined
    back?.()
  }

  const items = () => [...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]

  window.addEventListener(
    'mousedown',
    (event) => {
      if (!element.hidden && !element.contains(event.target as Node)) close()
    },
    true,
  )
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || element.hidden) return
      close()
      event.preventDefault()
      event.stopPropagation()
    },
    true,
  )
  // Enter and Space press the focused item as any button does
  element.addEventListener('keydown', (event) => {
    const step = STEPS[event.key]
    const enabled = items()
    if (!step || enabled.length === 0) return
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement)
    const next = enabled[step(Math.max(index, 0), enabled.length)]
    next?.focus()
    next?.scrollIntoView({ block: 'nearest' })
    event.preventDefault()
  })

  return {
    isOpen: () => !element.hidden,
    close,
    open(
      actions: readonly MenuAction[],
      x: number,
      y: number,
      above: boolean,
      onClose?: () => void,
      options: MenuOptions = {},
    ): MenuHandle {
      openings += 1
      const opening = openings
      const caption =
        options.caption === undefined
          ? []
          : [h('div', { class: 'menu-caption', id: 'tab-menu-caption' }, options.caption)]
      if (options.caption === undefined) element.removeAttribute('aria-labelledby')
      else element.setAttribute('aria-labelledby', 'tab-menu-caption')
      const footerActions = options.footer ?? []
      list.replaceChildren(...actions.map((action) => menuItem(action, close)))
      footer.replaceChildren(...footerActions.map((action) => menuItem(action, close)))
      element.replaceChildren(
        ...caption,
        list,
        ...(footerActions.length > 0 ? [divider, footer] : []),
      )
      element.hidden = false
      restore = onClose
      // Measured at its natural height: a cap from the last opening would hide how tall it is now
      element.style.maxHeight = ''
      const { width, height } = element.getBoundingClientRect()
      const place = placeMenu(
        { x, y, width, height, above, ...(options.align ? { align: options.align } : {}) },
        { width: window.innerWidth, height: window.innerHeight },
      )
      element.style.left = `${place.left}px`
      element.style.top = `${place.top}px`
      if (place.maxHeight !== undefined) element.style.maxHeight = `${place.maxHeight}px`
      list.scrollTop = 0
      // Otherwise the browser decides, so a menu opened from the keyboard keeps its ring
      items()[0]?.focus(options.pointer ? { focusVisible: false } : undefined)
      return {
        close: () => {
          if (opening === openings) close()
        },
      }
    },
  }
}
