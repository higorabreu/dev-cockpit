import {
  connectionErrorKey,
  filterMergeRequests,
  type HostApi,
  type MergeRequestSummary,
  type MergeRequestView,
  type Translator,
  type ViewSnapshot,
  visibleRange,
} from '@dck/core'
import { h, icon } from './panel/dom.ts'
import { agoText } from './panel/format.ts'

const ROW_HEIGHT = 46
const OVERSCAN = 4
// Dado mais velho que isso é buscado de novo ao abrir
const STALE_MS = 60_000
// Para o selo do trilho, que não precisa estar tão fresco quanto a lista aberta
const WARM_STALE_MS = 5 * 60_000
const VIEWS: readonly MergeRequestView[] = ['review', 'mine']

// Ícones SVG e não caracteres: a fonte de reserva dos símbolos desalinha o chip
const GLYPHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  ring: '<circle cx="12" cy="12" r="5.5"/>',
} as const

export interface ViewsViewDeps {
  readonly api: HostApi
  readonly i18n: Translator
  onClose(): void
  openSettings(): void
  // Quantas MRs esperam a review do usuário; alimenta o selo do ícone no trilho
  onReviewCount(count: number): void
}

const unavailable: ViewSnapshot = {
  view: 'review',
  items: [],
  updatedAt: undefined,
  state: 'unconfigured',
  error: undefined,
}

// Visões Review e Minhas: lista virtualizada, filtro sempre ativo, teclado primeiro
export function createViewsView(overlay: HTMLElement, deps: ViewsViewDeps) {
  const { api, i18n } = deps
  const t = i18n.t
  const snapshots = new Map<MergeRequestView, ViewSnapshot>()
  let current: MergeRequestView = 'review'
  let query = ''
  let onlyPending = false
  let selected = 0
  let matches: readonly MergeRequestSummary[] = []
  let frame = 0

  const isOpen = () => overlay.classList.contains('open')
  const announceCount = () => {
    const review = snapshots.get('review')
    deps.onReviewCount(review && review.state !== 'unconfigured' ? review.items.length : 0)
  }
  const snapshotOf = (view: MergeRequestView) => snapshots.get(view) ?? { ...unavailable, view }

  const input = h('input', {
    type: 'text',
    class: 'vinput',
    autocomplete: 'off',
    spellcheck: 'false',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'views-list',
    'aria-label': t('views.filter.placeholder'),
    placeholder: t('views.filter.placeholder'),
  })
  const tabs = h('div', {
    class: 'vtabs',
    role: 'tablist',
    'aria-label': t('views.title'),
  })
  const status = h('span', { class: 'vstatus', role: 'status' })
  const refreshButton = h('button', {
    type: 'button',
    class: 'vbtn',
    'data-focus': 'views-refresh',
  })
  const pendingButton = h('button', { type: 'button', class: 'vbtn', 'aria-pressed': 'false' })
  const notice = h('div', { class: 'vnotice' })
  const list = h('div', { class: 'vlist', id: 'views-list', role: 'listbox', tabindex: '-1' })
  const inner = h('div', { class: 'vinner' })
  list.append(inner)
  const hint = h('div', { class: 'vhint' })
  const box = h(
    'div',
    { id: 'views-box' },
    h('div', { class: 'vhead' }, tabs, status, refreshButton),
    h('div', { class: 'vbar' }, input, pendingButton),
    notice,
    list,
    hint,
  )
  overlay.replaceChildren(box)

  const kbd = (keys: string, label: string) =>
    h('span', { class: 'vkey' }, h('kbd', { class: 'vk' }, keys), ` ${label}`)

  function drawStatic() {
    overlay.setAttribute('aria-label', t('views.title'))
    refreshButton.replaceChildren(t('views.refresh'), h('kbd', { class: 'vk' }, 'Ctrl+R'))
    pendingButton.replaceChildren(t('views.pending'), h('kbd', { class: 'vk' }, 'Alt+P'))
    input.placeholder = t('views.filter.placeholder')
    hint.replaceChildren(
      kbd('↑↓', t('views.hint.navigate')),
      kbd('Enter', t('views.hint.open')),
      kbd('←→', t('views.hint.switch')),
      kbd('Esc', t('views.hint.close')),
    )
  }

  function drawTabs() {
    tabs.replaceChildren(
      ...VIEWS.map((view) => {
        const count = snapshotOf(view).items.length
        const tab = h(
          'button',
          {
            type: 'button',
            class: 'vtab',
            role: 'tab',
            'aria-selected': String(view === current),
            tabindex: '-1',
          },
          t(`views.${view}`),
          h('span', { class: 'vcount' }, String(count)),
        )
        tab.addEventListener('click', () => switchView(view))
        return tab
      }),
    )
  }

  function flags(item: MergeRequestSummary): HTMLElement[] {
    const chip = (kind: string, glyph: keyof typeof GLYPHS, text: string) =>
      h('span', { class: 'vflag', 'data-kind': kind }, icon(GLYPHS[glyph], 11), h('span', {}, text))
    const out: HTMLElement[] = []
    if (item.draft) out.push(chip('muted', 'ring', t('views.flag.draft')))
    if (item.hasConflicts) out.push(chip('critical', 'cross', t('views.flag.conflict')))
    if (item.openDiscussions) out.push(chip('warning', 'dot', t('views.flag.discussions')))
    const pipeline = {
      success: ['muted', 'check', 'views.flag.pipeline.success'],
      failed: ['critical', 'cross', 'views.flag.pipeline.failed'],
      running: ['warning', 'dot', 'views.flag.pipeline.running'],
      pending: ['warning', 'ring', 'views.flag.pipeline.pending'],
      canceled: ['muted', 'ring', 'views.flag.pipeline.canceled'],
    } as const
    if (item.pipeline in pipeline) {
      const [kind, glyph, key] = pipeline[item.pipeline as keyof typeof pipeline]
      out.push(chip(kind, glyph, t(key)))
    }
    return out
  }

  function row(item: MergeRequestSummary, index: number): HTMLElement {
    const elapsed = agoText(i18n, Date.now() / 1000, Date.parse(item.updatedAt) / 1000)
    const element = h(
      'div',
      {
        class: 'vrow',
        role: 'option',
        id: `views-row-${index}`,
        'aria-selected': String(index === selected),
        'aria-posinset': String(index + 1),
        'aria-setsize': String(matches.length),
        style: `transform: translateY(${index * ROW_HEIGHT}px)`,
      },
      h(
        'span',
        { class: 'vmain' },
        h('span', { class: 'vtitle' }, item.title),
        h(
          'span',
          { class: 'vmeta' },
          h('span', { class: 'vref' }, `${item.project}!${item.number}`),
          h('span', { class: 'vbranch' }, item.sourceBranch),
          h('span', {}, `${item.author} · ${elapsed}`),
        ),
      ),
      h('span', { class: 'vflags' }, ...flags(item)),
    )
    element.addEventListener('click', () => {
      selected = index
      openSelected()
    })
    return element
  }

  function drawList() {
    inner.style.height = `${matches.length * ROW_HEIGHT}px`
    const { start, end } = visibleRange({
      scrollTop: list.scrollTop,
      viewportHeight: list.clientHeight || ROW_HEIGHT * 8,
      rowHeight: ROW_HEIGHT,
      count: matches.length,
      overscan: OVERSCAN,
    })
    inner.replaceChildren(
      ...matches.slice(start, end).map((item, offset) => row(item, start + offset)),
    )
    input.setAttribute('aria-activedescendant', matches.length > 0 ? `views-row-${selected}` : '')
  }

  function drawNotice() {
    const snapshot = snapshotOf(current)
    notice.replaceChildren()
    notice.classList.remove('setup')
    notice.hidden = true
    const show = (...children: (Node | string)[]) => {
      notice.hidden = false
      notice.append(...children)
    }
    if (snapshot.state === 'unconfigured') {
      const open = h('button', { type: 'button', class: 'vbtn' }, t('views.openSettings'))
      open.addEventListener('click', () => {
        close()
        deps.openSettings()
      })
      notice.classList.add('setup')
      return show(
        h('strong', {}, t('views.unconfigured.title')),
        h('span', {}, t('views.unconfigured.text')),
        open,
      )
    }
    if (snapshot.state === 'error' && snapshot.error) {
      return show(t('views.error', { reason: t(connectionErrorKey(snapshot.error)) }))
    }
    if (matches.length === 0 && snapshot.state !== 'refreshing') {
      show(t(query !== '' || onlyPending ? 'views.empty.filtered' : `views.empty.${current}`))
    }
  }

  function drawStatus() {
    const snapshot = snapshotOf(current)
    if (snapshot.state === 'refreshing') status.textContent = t('views.refreshing')
    else if (snapshot.updatedAt === undefined) status.textContent = ''
    else
      status.textContent = t('views.updated', {
        ago: agoText(i18n, Date.now() / 1000, snapshot.updatedAt / 1000),
      })
  }

  function refilter(keepId?: string) {
    matches = filterMergeRequests(snapshotOf(current).items, query, onlyPending)
    const kept = keepId === undefined ? -1 : matches.findIndex((item) => item.id === keepId)
    selected = kept === -1 ? 0 : kept
    redraw()
  }

  function redraw() {
    pendingButton.setAttribute('aria-pressed', String(onlyPending))
    drawTabs()
    drawStatus()
    drawNotice()
    drawList()
  }

  function schedule() {
    if (frame === 0)
      frame = requestAnimationFrame(() => {
        frame = 0
        drawList()
      })
  }

  function reveal() {
    const top = selected * ROW_HEIGHT
    const bottom = top + ROW_HEIGHT
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight
    drawList()
  }

  function move(step: number) {
    if (matches.length === 0) return
    selected = Math.min(matches.length - 1, Math.max(0, selected + step))
    reveal()
  }

  function openSelected() {
    const item = matches[selected]
    if (item) api.external.open(item.url)
  }

  function switchView(view: MergeRequestView) {
    if (view === current) return
    current = view
    refilter()
    void load(view)
  }

  async function load(view: MergeRequestView) {
    const snapshot = await api.views.refresh(view, STALE_MS)
    if (snapshot) snapshots.set(view, snapshot)
    announceCount()
    if (isOpen() && view === current) refilter(matches[selected]?.id)
  }

  function refresh() {
    void api.views.refresh(current).then((snapshot) => {
      if (snapshot) snapshots.set(current, snapshot)
    })
  }

  function close() {
    overlay.classList.remove('open')
    query = ''
    input.value = ''
    onlyPending = false
    deps.onClose()
  }

  input.addEventListener('input', () => {
    query = input.value
    refilter()
  })
  input.addEventListener('keydown', (event) => {
    const key = event.key
    if (key === 'Escape') {
      if (query !== '') {
        query = ''
        input.value = ''
        refilter()
      } else close()
    } else if (key === 'ArrowDown') move(1)
    else if (key === 'ArrowUp') move(-1)
    else if (key === 'PageDown') move(8)
    else if (key === 'PageUp') move(-8)
    else if (key === 'Enter') openSelected()
    else if ((key === 'ArrowLeft' || key === 'ArrowRight') && query === '') {
      const step = key === 'ArrowRight' ? 1 : -1
      switchView(VIEWS[(VIEWS.indexOf(current) + step + VIEWS.length) % VIEWS.length] ?? current)
    } else if (event.ctrlKey && key.toLowerCase() === 'r') refresh()
    else if (event.altKey && key.toLowerCase() === 'p') {
      onlyPending = !onlyPending
      refilter()
    } else return
    event.preventDefault()
    event.stopPropagation()
  })
  list.addEventListener('scroll', schedule, { passive: true })
  refreshButton.addEventListener('click', refresh)
  pendingButton.addEventListener('click', () => {
    onlyPending = !onlyPending
    refilter()
    input.focus()
  })
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close()
  })

  // O daemon publica o estado novo de uma visão depois de cada busca
  api.views.onChange((snapshot) => {
    snapshots.set(snapshot.view, snapshot)
    announceCount()
    if (isOpen() && snapshot.view === current) refilter(matches[selected]?.id)
    else if (isOpen()) drawTabs()
  })

  drawStatic()

  return {
    isOpen,
    close,
    async open() {
      overlay.classList.add('open')
      input.focus()
      // Mostra o que está guardado na hora; a busca roda por cima se o dado estiver velho
      for (const view of VIEWS) {
        const snapshot = await api.views.snapshot(view)
        if (snapshot) snapshots.set(view, snapshot)
      }
      refilter()
      for (const view of VIEWS) void load(view)
    },
    toggle() {
      if (isOpen()) close()
      else void this.open()
    },
    // Sem abrir a tela: traz o que está guardado e atualiza se tiver mais de 5 minutos, para o selo do trilho
    async warm() {
      const snapshot = await api.views.refresh('review', WARM_STALE_MS)
      if (snapshot) snapshots.set('review', snapshot)
      announceCount()
    },
    retranslate() {
      drawStatic()
      if (isOpen()) redraw()
    },
  }
}
