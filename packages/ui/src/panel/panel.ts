import { clampPanelWidth, PANEL_WIDTH, readPreference } from '@dck/core'
import { h, icon } from './dom.ts'

export interface PanelSection {
  readonly id: string
  readonly label: string
  // Traços do ícone do trilho, em 24x24
  readonly icon: string
  readonly expandedByDefault: boolean
  // Texto curto à direita do título, visível mesmo com a seção recolhida
  summary(): string
  // Selo do trilho, só quando algo pede atenção
  badge(): string | undefined
  body(): HTMLElement
}

export interface PanelElements {
  readonly dock: HTMLElement
  readonly panel: HTMLElement
  readonly rail: HTMLElement
  readonly split: HTMLElement
}

export interface PanelOptions {
  readonly elements: PanelElements
  readonly sections: readonly PanelSection[]
  title(): string
  // Chamado depois de um clique de mouse, para o terminal voltar a receber as teclas
  afterPointer?(): void
  // Carrega os dados das seções abertas; só roda com o painel visível
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
  const { dock, panel, rail, split } = options.elements
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
      // sem armazenamento, o estado vale só nesta execução
    }
  }

  // Redesenhar troca os botões; quem usa o teclado não pode perder o foco por isso
  function keepFocus(redraw: () => void) {
    const active = document.activeElement
    const toggle = active?.getAttribute('data-toggle')
    const section = active?.getAttribute('data-section')
    redraw()
    const selector = toggle
      ? `[data-toggle="${toggle}"]`
      : section
        ? `[data-section="${section}"]`
        : ''
    if (selector)
      document.querySelector<HTMLElement>(`#panel ${selector}, #rail ${selector}`)?.focus()
  }

  function renderRail() {
    rail.replaceChildren(
      ...options.sections.map((section) => {
        const badge = section.badge()
        return h(
          'button',
          {
            type: 'button',
            'data-section': section.id,
            'aria-label': section.label,
            title: section.label,
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
      h('div', { class: 'phead' }, h('b', {}, 'Painel'), h('span', {}, options.title())),
      open.length > 0 && h('div', { class: 'stack' }, ...open.map(sectionBlock)),
      // Recolhidas ficam no fim da coluna, abaixo das abertas; sem nenhuma aberta, alinham no topo
      closed.length > 0 &&
        h(
          'div',
          { class: open.length > 0 ? 'collapsed pinned' : 'collapsed' },
          ...closed.map(sectionBlock),
        ),
    )
    // Só troca o DOM quando o conteúdo mudou, para não perder foco e hover a cada ciclo
    if (content.innerHTML === signature) return
    signature = content.innerHTML
    panel.replaceChildren(content)
    settleEnter()
  }

  // A seção que acabou de abrir nasce com o conteúdo fechado e cresce no quadro seguinte
  function settleEnter() {
    pendingEnter = undefined
    const wrap = panel.querySelector('[data-state="enter"]')
    if (!wrap) return
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.removeAttribute('data-state')))
  }

  const sectionTops = () =>
    new Map(
      [...panel.querySelectorAll<HTMLElement>('.psec')].map((el) => [
        el.id,
        el.getBoundingClientRect().top,
      ]),
    )

  // Seções que mudam de lugar (abertas em cima, recolhidas no fim) deslizam até a nova posição
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
    refresh: () => void refresh(),
  }
}
