import {
  type ConnectorView,
  connectionErrorKey,
  filterViewItems,
  type HostApi,
  type PluralKey,
  type Translator,
  type ViewItem,
  type ViewSnapshot,
  visibleRange,
} from '@dck/core'
import { actionHint, closeButton, hintBar, keyHint } from '../kit/panel-frame.ts'
import { h, icon } from '../panel/dom.ts'
import { agoText } from '../panel/format.ts'

const ROW_HEIGHT = 46
const OVERSCAN = 4
// Data older than this is fetched again on open
const STALE_MS = 60_000
// For the rail badge, which does not need to be as fresh as the open list
const WARM_STALE_MS = 5 * 60_000

type MergeRequestItem = Extract<ViewItem, { kind: 'mergeRequest' }>
const isMergeRequest = (item: ViewItem): item is MergeRequestItem => item.kind === 'mergeRequest'
// The kinds this screen draws a row for; a view of another kind is left out until its row exists
const DRAWN_KINDS: ReadonlySet<ViewItem['kind']> = new Set(['mergeRequest'])

// SVG icons rather than characters: the fallback font for the symbols misaligns the chip
const GLYPHS = {
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  ring: '<circle cx="12" cy="12" r="5.5"/>',
} as const

export interface ViewsViewDeps {
  readonly api: HostApi
  readonly i18n: Translator
  onClose(): void
  openSettings(): void
  // The item count of the view a connector marked for the rail badge, with the text that says what they are
  onBadge(count: number, label: PluralKey | undefined): void
}

const unavailable: Omit<ViewSnapshot, 'view'> = {
  items: [],
  updatedAt: undefined,
  state: 'unconfigured',
  error: undefined,
}

// The views of the connected connectors: virtualized list, always-on filter, keyboard first
export function createViewsView(overlay: HTMLElement, deps: ViewsViewDeps) {
  const { api, i18n } = deps
  const t = i18n.t
  const snapshots = new Map<string, ViewSnapshot>()
  // Every view of the enabled connectors; a tab only shows once its account is connected
  let views: readonly ConnectorView[] = []
  let current: string | undefined
  let query = ''
  let onlyPending = false
  let selected = 0
  let matches: readonly MergeRequestItem[] = []
  let frame = 0

  const isOpen = () => overlay.classList.contains('open')
  const snapshotOf = (view: string): ViewSnapshot => snapshots.get(view) ?? { ...unavailable, view }
  const connectedViews = () => views.filter((view) => snapshotOf(view.id).state !== 'unconfigured')
  const currentView = () => connectedViews().find((view) => view.id === current)
  // A view that is gone or lost its account gives its place to the first connected one
  const settleCurrent = () => {
    if (currentView() === undefined) current = connectedViews()[0]?.id
  }
  const announceCount = () => {
    const badge = views.find((view) => view.badge !== undefined)
    const snapshot = badge && snapshotOf(badge.id)
    const count = snapshot && snapshot.state !== 'unconfigured' ? snapshot.items.length : 0
    deps.onBadge(count, badge?.badge)
  }

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
  const pendingButton = h('button', { type: 'button', class: 'vbtn', 'aria-pressed': 'false' })
  const notice = h('div', { class: 'vnotice' })
  const list = h('div', {
    class: 'vlist scroll',
    id: 'views-list',
    role: 'listbox',
    tabindex: '-1',
  })
  const inner = h('div', { class: 'vinner' })
  list.append(inner)
  const hint = hintBar()
  const box = h(
    'div',
    { id: 'views-box' },
    h('div', { class: 'vhead' }, tabs, status, closeButton(t, close)),
    h('div', { class: 'vbar' }, input, pendingButton),
    notice,
    list,
    hint,
  )
  overlay.replaceChildren(box)

  const refreshButton = () => {
    const button = actionHint('Ctrl+R', t('views.refresh'))
    button.addEventListener('click', refresh)
    return button
  }

  function drawStatic() {
    overlay.setAttribute('aria-label', t('views.title'))
    pendingButton.textContent = t('views.pending')
    pendingButton.dataset.tip = t('views.pending')
    pendingButton.dataset.tipKey = 'Ctrl+P'
    input.placeholder = t('views.filter.placeholder')
    hint.replaceChildren(
      keyHint('↑↓', t('views.hint.navigate')),
      keyHint('Enter', t('views.hint.open')),
      keyHint('←→', t('views.hint.switch')),
      refreshButton(),
    )
  }

  function drawTabs() {
    tabs.replaceChildren(
      ...connectedViews().map((view) => {
        const count = snapshotOf(view.id).items.length
        const tab = h(
          'button',
          {
            type: 'button',
            class: 'vtab',
            role: 'tab',
            'aria-selected': String(view.id === current),
            tabindex: '-1',
          },
          t(view.title),
          h('span', { class: 'vcount' }, String(count)),
        )
        tab.addEventListener('click', () => switchView(view.id))
        return tab
      }),
    )
  }

  function flags(item: MergeRequestItem): HTMLElement[] {
    const chip = (kind: string, glyph: keyof typeof GLYPHS, text: string) =>
      h(
        'span',
        { class: 'vflag', 'data-kind': kind },
        icon(GLYPHS[glyph], 11),
        h('span', { class: 'vflag-text' }, text),
      )
    const out: HTMLElement[] = []
    if (item.draft) out.push(chip('muted', 'ring', t('views.flag.draft')))
    if (item.hasConflicts) out.push(chip('critical', 'cross', t('views.flag.conflict')))
    if (item.openDiscussions) out.push(chip('warning', 'dot', t('views.flag.discussions')))
    const pipeline = {
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

  function row(item: MergeRequestItem, index: number): HTMLElement {
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
    const view = currentView()
    const snapshot = view && snapshotOf(view.id)
    notice.replaceChildren()
    notice.classList.remove('setup')
    list.hidden = snapshot === undefined
    notice.hidden = true
    const show = (...children: (Node | string)[]) => {
      notice.hidden = false
      notice.append(...children)
    }
    if (view === undefined || snapshot === undefined) {
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
      show(t(query !== '' || onlyPending ? 'views.empty.filtered' : view.empty))
    }
  }

  function drawStatus() {
    const snapshot = current === undefined ? undefined : snapshotOf(current)
    if (snapshot?.state === 'refreshing') status.textContent = t('views.refreshing')
    else if (snapshot?.updatedAt === undefined) status.textContent = ''
    else
      status.textContent = t('views.updated', {
        ago: agoText(i18n, Date.now() / 1000, snapshot.updatedAt / 1000),
      })
  }

  function refilter(keepId?: string) {
    settleCurrent()
    const items = current === undefined ? [] : snapshotOf(current).items
    matches = filterViewItems(items, query, onlyPending).filter(isMergeRequest)
    const kept = keepId === undefined ? -1 : matches.findIndex((item) => item.id === keepId)
    selected = kept === -1 ? 0 : kept
    redraw()
  }

  function redraw() {
    pendingButton.setAttribute('aria-pressed', String(onlyPending))
    // Only a merge request can need attention
    const kind = currentView()?.kind
    pendingButton.hidden = kind !== undefined && kind !== 'mergeRequest'
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

  function switchView(view: string) {
    if (view === current) return
    current = view
    refilter()
    void load(view)
  }

  async function load(view: string) {
    const snapshot = await api.views.refresh(view, STALE_MS)
    if (snapshot) snapshots.set(view, snapshot)
    announceCount()
    if (isOpen() && view === current) refilter(matches[selected]?.id)
  }

  function refresh() {
    const view = current
    if (view === undefined) return
    void api.views.refresh(view).then((snapshot) => {
      if (snapshot) snapshots.set(view, snapshot)
    })
  }

  // The enabled connectors decide which views exist; a disabled one takes its tabs and its badge away
  async function loadViews() {
    const connectors = await api.connections.list()
    views = connectors.flatMap((connector) =>
      connector.views.filter((view) => DRAWN_KINDS.has(view.kind)),
    )
    for (const view of snapshots.keys())
      if (!views.some((known) => known.id === view)) snapshots.delete(view)
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
      const ids = connectedViews().map((view) => view.id)
      const index = current === undefined ? -1 : ids.indexOf(current)
      const next = ids[(index + step + ids.length) % ids.length]
      if (next !== undefined) switchView(next)
    } else if (event.ctrlKey && key.toLowerCase() === 'r') refresh()
    else if (event.ctrlKey && !event.shiftKey && key.toLowerCase() === 'p') {
      onlyPending = !onlyPending
      refilter()
    } else return
    event.preventDefault()
    event.stopPropagation()
  })
  list.addEventListener('scroll', schedule, { passive: true })
  pendingButton.addEventListener('click', () => {
    onlyPending = !onlyPending
    refilter()
  })
  // Keys are listened for on the field: after clicking any button focus returns to it, otherwise the shortcuts stop
  box.addEventListener('click', () => {
    if (isOpen()) input.focus()
  })
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close()
  })

  // The daemon publishes the new state of a view after each fetch
  api.views.onChange((snapshot) => {
    if (!views.some((view) => view.id === snapshot.view)) return
    const wasConnected = snapshotOf(snapshot.view).state !== 'unconfigured'
    snapshots.set(snapshot.view, snapshot)
    announceCount()
    const connectionChanged = wasConnected !== (snapshot.state !== 'unconfigured')
    if (isOpen() && (snapshot.view === current || connectionChanged))
      refilter(matches[selected]?.id)
    else if (isOpen()) drawTabs()
  })

  drawStatic()

  return {
    isOpen,
    close,
    async open() {
      overlay.classList.add('open')
      input.focus()
      await loadViews()
      // Shows what is stored right away; the fetch runs on top if the data is stale
      for (const view of views) {
        const snapshot = await api.views.snapshot(view.id)
        if (snapshot) snapshots.set(view.id, snapshot)
      }
      refilter()
      for (const view of views) void load(view.id)
    },
    toggle() {
      if (isOpen()) close()
      else void this.open()
    },
    // Without opening the screen: loads what is stored and refreshes if older than 5 minutes, for the rail badge
    async warm() {
      await loadViews()
      const badge = views.find((view) => view.badge !== undefined)
      const snapshot = badge && (await api.views.refresh(badge.id, WARM_STALE_MS))
      if (badge && snapshot) snapshots.set(badge.id, snapshot)
      announceCount()
      if (isOpen()) refilter(matches[selected]?.id)
    },
    retranslate() {
      drawStatic()
      if (isOpen()) redraw()
    },
  }
}
