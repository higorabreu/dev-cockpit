import { clampPanelWidth, PANEL_WIDTH, readPreference, type Translate } from '@dck/core'
import { h, icon } from './dom.ts'

export interface PanelSection {
  readonly id: string
  readonly label: string
  // Strokes of the rail icon, on 24x24
  readonly icon: string
  readonly expandedByDefault: boolean
  // Short text to the right of the title, visible even with the section collapsed
  summary(): string
  // Rail badge, only when something needs attention
  badge(): string | undefined
  body(): HTMLElement
}

export interface PanelElements {
  readonly dock: HTMLElement
  readonly panel: HTMLElement
  readonly rail: HTMLElement
  readonly toggle: HTMLElement
  readonly split: HTMLElement
}

export interface PanelOptions {
  readonly elements: PanelElements
  readonly sections: readonly PanelSection[]
  title(): string
  t: Translate
  // Called after a mouse click, so the terminal receives keys again
  afterPointer?(): void
  // Loads the data of the open sections; only runs with the panel visible
  refresh(expanded: readonly string[]): Promise<void>
}

interface Stored {
  open: boolean
  sections: Record<string, boolean>
  width: number
}

const STORAGE_KEY = 'dck-panel-v2'
const REFRESH_MS = 2000
const KEY_STEP = 16
const MOTION_MS = 170
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

function load(sections: readonly PanelSection[]): Stored {
  const defaults: Stored = {
    open: false,
    sections: Object.fromEntries(sections.map((s) => [s.id, s.expandedByDefault])),
    width: PANEL_WIDTH.initial,
  }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return defaults
    const stored = raw as Partial<Stored>
    return {
      open: stored.open === true,
      sections: { ...defaults.sections, ...stored.sections },
      width: readPreference(String(stored.width), PANEL_WIDTH),
    }
  } catch {
    return defaults
  }
}

export function createPanel(options: PanelOptions) {
  const { dock, panel, rail, split, toggle } = options.elements
  const state = load(options.sections)
  let timer: ReturnType<typeof setInterval> | undefined
  let pending = false
  let signature = ''
  let pendingEnter: string | undefined

  const expanded = () => options.sections.filter((s) => state.sections[s.id]).map((s) => s.id)

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // without storage, the state only lasts for this run
    }
  }

  // Redrawing replaces the buttons; keyboard users must not lose focus because of it
  function keepFocus(redraw: () => void) {
    const key = document.activeElement?.getAttribute('data-focus')
    redraw()
    if (key) document.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus()
  }

  // Only replaces the buttons when something changed: rebuilding them every cycle drops the tooltip of someone
  // hovering with the mouse, which never even gets to show
  let railSignature = ''

  function renderRail() {
    const signature = JSON.stringify(
      options.sections.map((section) => [
        section.id,
        section.badge() ?? '',
        state.open && state.sections[section.id] === true,
      ]),
    )
    if (signature === railSignature) return
    railSignature = signature
    rail.replaceChildren(
      ...options.sections.map((section) => {
        const badge = section.badge()
        return h(
          'button',
          {
            type: 'button',
            'data-section': section.id,
            'data-focus': `rail-${section.id}`,
            'aria-label': section.label,
            'data-tip': section.label,
            'aria-expanded': String(state.open && state.sections[section.id] === true),
          },
          icon(section.icon),
          badge && h('span', { class: 'badge' }, badge),
        )
      }),
    )
  }

  function sectionBlock(section: PanelSection) {
    const open = state.sections[section.id] === true
    return h(
      'section',
      { class: 'psec', id: `sec-${section.id}` },
      h(
        'button',
        {
          type: 'button',
          class: 'shead',
          'data-toggle': section.id,
          'aria-expanded': String(open),
        },
        icon('<path d="M9 6l6 6-6 6"/>', 10, 'chev'),
        section.label,
        h('span', { class: 'count' }, section.summary()),
      ),
      open &&
        h(
          'div',
          { class: 'body-wrap', 'data-state': pendingEnter === section.id ? 'enter' : undefined },
          h('div', { class: 'body-inner' }, h('div', { class: 'body' }, section.body())),
        ),
    )
  }

  function renderPanel() {
    const open = options.sections.filter((s) => state.sections[s.id] === true)
    const closed = options.sections.filter((s) => state.sections[s.id] !== true)
    const content = h(
      'div',
      { class: 'pinner' },
      h('div', { class: 'phead' }, options.title()),
      h(
        'div',
        { class: 'pscroll scroll' },
        open.length > 0 && h('div', { class: 'stack' }, ...open.map(sectionBlock)),
        // Collapsed ones go at the end of the column, below the open ones; with none open, they align at the top
        closed.length > 0 &&
          h(
            'div',
            { class: open.length > 0 ? 'collapsed pinned' : 'collapsed' },
            ...closed.map(sectionBlock),
          ),
      ),
    )
    // Only replaces the DOM when the content changed, to avoid losing focus and hover every cycle
    if (content.innerHTML === signature) return
    signature = content.innerHTML
    // The list is rebuilt on every change; without saving, the scroll returns to the top
    const scrolled = panel.querySelector('.pscroll')?.scrollTop ?? 0
    panel.replaceChildren(content)
    const scroller = panel.querySelector('.pscroll')
    if (scroller) scroller.scrollTop = scrolled
    settleEnter()
  }

  // A section that just opened starts with its content closed and grows on the next frame
  function settleEnter() {
    pendingEnter = undefined
    const entering = panel.querySelectorAll('[data-state="enter"]')
    if (entering.length === 0) return
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        for (const wrap of entering) wrap.removeAttribute('data-state')
      }),
    )
  }

  const sectionTops = () =>
    new Map(
      [...panel.querySelectorAll<HTMLElement>('.psec')].map((el) => [
        el.id,
        el.getBoundingClientRect().top,
      ]),
    )

  // Sections that change place (open on top, collapsed at the end) slide to the new position
  function slideFrom(before: Map<string, number>) {
    if (reducedMotion.matches) return
    for (const el of panel.querySelectorAll<HTMLElement>('.psec')) {
      const delta =
        (before.get(el.id) ?? el.getBoundingClientRect().top) - el.getBoundingClientRect().top
      if (delta !== 0) {
        el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
          duration: MOTION_MS,
          easing: EASING,
        })
      }
    }
  }

  function toggleSection(id: string, opening = state.sections[id] !== true) {
    const apply = () => {
      const before = sectionTops()
      state.sections[id] = opening
      pendingEnter = opening ? id : undefined
      save()
      signature = ''
      render()
      slideFrom(before)
      void refresh()
    }
    const wrap = panel.querySelector(`#sec-${id} .body-wrap`)
    if (!opening && wrap && !reducedMotion.matches) {
      wrap.setAttribute('data-state', 'closing')
      setTimeout(apply, MOTION_MS)
      return
    }
    apply()
  }

  function render() {
    dock.dataset.open = String(state.open)
    toggle.setAttribute('aria-expanded', String(state.open))
    panel.style.setProperty('--panel-width', `${state.width}px`)
    split.setAttribute('aria-valuenow', String(state.width))
    keepFocus(() => {
      renderRail()
      if (state.open) renderPanel()
    })
  }

  async function refresh() {
    if (!state.open || pending || document.hidden) return
    pending = true
    try {
      await options.refresh(expanded())
    } finally {
      pending = false
    }
    render()
  }

  function setOpen(open: boolean) {
    state.open = open
    save()
    clearInterval(timer)
    if (open) timer = setInterval(() => void refresh(), REFRESH_MS)
    signature = ''
    render()
    void refresh()
  }

  function focusSection(id: string) {
    if (!state.open) {
      state.sections[id] = true
      save()
      setOpen(true)
    } else if (state.sections[id] !== true) {
      toggleSection(id, true)
    }
    panel.querySelector(`#sec-${id}`)?.scrollIntoView({ block: 'nearest' })
  }

  function toggleFromRail(id: string) {
    if (state.open && state.sections[id] === true) toggleSection(id, false)
    else focusSection(id)
  }

  toggle.addEventListener('click', (event) => {
    setOpen(!state.open)
    if (event.detail > 0) options.afterPointer?.()
  })

  rail.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-section]')
    if (!button?.dataset.section) return
    toggleFromRail(button.dataset.section)
    if (event.detail > 0) options.afterPointer?.()
  })

  panel.addEventListener('click', (event) => {
    const header = (event.target as Element).closest<HTMLElement>('[data-toggle]')
    if (!header?.dataset.toggle) return
    toggleSection(header.dataset.toggle)
    if (event.detail > 0) options.afterPointer?.()
  })

  function resize(width: number) {
    state.width = clampPanelWidth(width)
    panel.style.setProperty('--panel-width', `${state.width}px`)
    split.setAttribute('aria-valuenow', String(state.width))
    save()
  }

  split.addEventListener('pointerdown', (event) => {
    split.setPointerCapture(event.pointerId)
    split.dataset.drag = 'true'
    const startX = event.clientX
    const startWidth = state.width
    const move = (moved: PointerEvent) => resize(startWidth + (startX - moved.clientX))
    const stop = () => {
      split.dataset.drag = 'false'
      split.removeEventListener('pointermove', move)
      split.removeEventListener('pointerup', stop)
    }
    split.addEventListener('pointermove', move)
    split.addEventListener('pointerup', stop)
  })
  split.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    resize(state.width + (event.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP))
    event.preventDefault()
  })

  setOpen(state.open)

  return {
    isOpen: () => state.open,
    toggle: () => setOpen(!state.open),
    open: () => setOpen(true),
    close: () => setOpen(false),
    render,
    // After switching language: rebuilds the rail and the panel even though nothing changed
    retranslate() {
      railSignature = ''
      signature = ''
      render()
    },
    refresh: () => void refresh(),
  }
}
