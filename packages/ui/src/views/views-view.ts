import {
  type ConnectorView,
  connectionErrorKey,
  filterViewItems,
  groupByProgress,
  type HostApi,
  type MessageKey,
  matchesReference,
  type PluralKey,
  type Translator,
  type ViewItem,
  type ViewSnapshot,
  visibleRange,
} from '@dck/core'
import { actionHint, closeButton, hintBar, keyHint } from '../kit/panel-frame.ts'
import { h, icon } from '../panel/dom.ts'
import { agoText } from '../panel/format.ts'
import { type LaidSection, layOutList, ROW_HEIGHT, rowSpan } from './list-layout.ts'
import { createProjectFilter } from './project-filter.ts'

const OVERSCAN = 4
// How long the header says what was copied before it goes back to the update time
const COPIED_MS = 2000
// Data older than this is fetched again on open
const STALE_MS = 60_000
// For the rail badge, which does not need to be as fresh as the open list
const WARM_STALE_MS = 5 * 60_000

type MergeRequestItem = Extract<ViewItem, { kind: 'mergeRequest' }>
type IssueItem = Extract<ViewItem, { kind: 'issue' }>
// The kinds this screen draws a row for; a view of another kind is left out until its row exists
const DRAWN_KINDS: ReadonlySet<ViewItem['kind']> = new Set(['mergeRequest', 'issue'])
// The filter says which fields it matches, and those depend on the kind of item
const FILTER_PLACEHOLDER: Readonly<Record<ViewItem['kind'], MessageKey>> = {
  mergeRequest: 'views.filter.placeholder',
  issue: 'views.filter.placeholder.issue',
}

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
  // The name of the service each view comes from, which heads its group of tabs
  let serviceOf: ReadonlyMap<string, string> = new Map()
  let current: string | undefined
  let query = ''
  let onlyPending = false
  let selected = 0
  // The items in the order they are drawn, under their section headers on a tab of tasks
  let layout = layOutList([])
  let matches: readonly ViewItem[] = []
  let frame = 0

  const isOpen = () => overlay.classList.contains('open')
  const snapshotOf = (view: string): ViewSnapshot => snapshots.get(view) ?? { ...unavailable, view }
  const connectedViews = () => views.filter((view) => snapshotOf(view.id).state !== 'unconfigured')
  const currentView = () => connectedViews().find((view) => view.id === current)
  const currentKind = () => currentView()?.kind ?? 'mergeRequest'
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
  // In place of the tabs while no account is connected, so the screen still says what it is
  const heading = h('h2', { class: 'vheading', hidden: true })
  const status = h('span', { class: 'vstatus', role: 'status' })
  const pendingButton = h('button', { type: 'button', class: 'vbtn', 'aria-pressed': 'false' })
  const projects = createProjectFilter({ i18n, onChange: () => refilter() })
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
  const bar = h('div', { class: 'vbar' }, input, projects.element, pendingButton)
  // The way to Connections while nothing is connected; it holds the focus then
  let setupButton: HTMLButtonElement | undefined
  const box = h(
    'div',
    { id: 'views-box' },
    h('div', { class: 'vhead' }, tabs, heading, status, closeButton(t, close)),
    bar,
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
    heading.textContent = t('views.title')
    pendingButton.textContent = t('views.pending')
    pendingButton.dataset.tip = t('views.pending')
    pendingButton.dataset.tipKey = 'Ctrl+P'
    drawKindTexts(true)
  }

  // The filter's placeholder and the hints follow the kind of the open tab; Ctrl+C only exists on a task,
  // and switching only when there is another tab
  let drawnTexts: string | undefined
  function drawKindTexts(force = false) {
    const kind = currentKind()
    const switchable = connectedViews().length > 1
    const texts = `${kind} ${switchable}`
    if (texts === drawnTexts && !force) return
    drawnTexts = texts
    const placeholder = t(FILTER_PLACEHOLDER[kind])
    input.placeholder = placeholder
    input.setAttribute('aria-label', placeholder)
    hint.replaceChildren(
      ...[
        keyHint('↑↓', t('views.hint.navigate')),
        keyHint('Enter', t('views.hint.open')),
        kind === 'issue' ? keyHint('Ctrl+C', t('views.hint.copyKey')) : undefined,
        switchable ? keyHint('←→', t('views.hint.switch')) : undefined,
        refreshButton(),
      ].filter((element) => element !== undefined),
    )
  }

  // A tablist may own only tabs, so the service's name is a visual label hidden from assistive technology and
  // each tab says the service in its own name; the tabs stay siblings, so ←→ crosses the groups
  function drawTabs() {
    const children: HTMLElement[] = []
    let group: string | undefined
    for (const view of connectedViews()) {
      const service = serviceOf.get(view.id) ?? ''
      if (service !== group) {
        group = service
        children.push(h('span', { class: 'vgroup', 'aria-hidden': 'true' }, service))
      }
      const title = t(view.title)
      const count = String(snapshotOf(view.id).items.length)
      const description = t(view.description)
      const tab = h(
        'button',
        {
          type: 'button',
          class: 'vtab',
          role: 'tab',
          'aria-selected': String(view.id === current),
          'aria-label': `${service}, ${title}, ${count}`,
          // The tooltip describes the list only under the mouse; this says it to a screen reader too
          'aria-description': description,
          'data-tip': description,
          tabindex: '-1',
        },
        title,
        h('span', { class: 'vcount' }, count),
      )
      tab.addEventListener('click', () => switchView(view.id))
      children.push(tab)
    }
    tabs.replaceChildren(...children)
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

  const elapsedSince = (updatedAt: string) =>
    agoText(i18n, Date.now() / 1000, Date.parse(updatedAt) / 1000)

  function mergeRequestContent(item: MergeRequestItem): HTMLElement[] {
    return [
      h(
        'span',
        { class: 'vmain' },
        h('span', { class: 'vtitle' }, item.title),
        h(
          'span',
          { class: 'vmeta' },
          h('span', { class: 'vref' }, `${item.project}!${item.number}`),
          h('span', { class: 'vbranch' }, item.sourceBranch),
          h('span', {}, `${item.author} · ${elapsedSince(item.updatedAt)}`),
        ),
      ),
      h('span', { class: 'vflags' }, ...flags(item)),
    ]
  }

  // A status is not a problem, so it is plain text with its glyph, not a chip: a ring while to do, a dot
  // once in progress, which reads stronger by contrast alone
  function issueContent(item: IssueItem, index: number): HTMLElement[] {
    const key = h(
      'span',
      {
        class: 'vref vcopy',
        'data-tip': t('views.copyKey'),
        'data-tip-key': 'Ctrl+C',
      },
      item.key,
    )
    key.addEventListener('click', (event) => {
      event.stopPropagation()
      selected = index
      drawList()
      copy(item)
    })
    const progress = item.statusCategory === 'progress'
    return [
      h(
        'span',
        { class: 'vmain' },
        h('span', { class: 'vtitle' }, item.summary),
        h(
          'span',
          { class: 'vmeta' },
          key,
          h('span', {}, `${item.type} · ${elapsedSince(item.updatedAt)}`),
        ),
      ),
      h(
        'span',
        { class: 'vstate', 'data-category': item.statusCategory },
        icon(GLYPHS[progress ? 'dot' : 'ring'], 11),
        h('span', { class: 'vstate-text' }, item.status),
      ),
    ]
  }

  function row(item: ViewItem, index: number, offset: number): HTMLElement {
    const element = h(
      'div',
      {
        class: 'vrow',
        role: 'option',
        id: `views-row-${index}`,
        'aria-selected': String(index === selected),
        'aria-posinset': String(index + 1),
        'aria-setsize': String(matches.length),
        // The row's own text reads as one run; a task is named by what people say about it
        'aria-label':
          item.kind === 'issue' ? `${item.key} ${item.summary}, ${item.status}` : undefined,
        style: `transform: translateY(${offset}px)`,
      },
      ...(item.kind === 'issue' ? issueContent(item, index) : mergeRequestContent(item)),
    )
    element.addEventListener('click', () => {
      selected = index
      openSelected()
    })
    return element
  }

  const sectionTitle = (section: LaidSection) =>
    section.category === undefined ? '' : t(`views.section.${section.category}`)

  // A listbox may hold groups of options, so a section is a labelled group; its visible header is hidden
  // from assistive technology, which hears the group's label instead
  function sectionGroup(section: LaidSection): HTMLElement {
    const count = section.end - section.start
    return h('div', {
      class: 'vsection',
      role: 'group',
      'aria-label': `${sectionTitle(section)}, ${count}`,
      style: `transform: translateY(${section.top}px); height: ${section.height}px`,
    })
  }

  function sectionHeader(section: LaidSection): HTMLElement {
    return h(
      'div',
      { class: 'vsection-head', 'aria-hidden': 'true' },
      h('span', {}, sectionTitle(section)),
      h('span', { class: 'vsection-count' }, String(section.end - section.start)),
    )
  }

  // Only the entries in view exist; a row inside a section is placed from the section's top
  function drawList() {
    inner.style.height = `${layout.height}px`
    const { start, end } = visibleRange({
      tops: layout.tops,
      scrollTop: list.scrollTop,
      viewportHeight: list.clientHeight || ROW_HEIGHT * 8,
      overscan: OVERSCAN,
    })
    const drawn: HTMLElement[] = []
    const groups = new Map<number, HTMLElement>()
    for (const entry of layout.entries.slice(start, end)) {
      const section = layout.sections[entry.section]
      if (section === undefined) continue
      let parent: HTMLElement | undefined
      if (section.category !== undefined) {
        parent = groups.get(entry.section)
        if (parent === undefined) {
          parent = sectionGroup(section)
          groups.set(entry.section, parent)
          drawn.push(parent)
        }
      }
      const base = parent === undefined ? 0 : section.top
      const item = entry.kind === 'row' ? matches[entry.index] : undefined
      const element =
        entry.kind === 'header'
          ? sectionHeader(section)
          : item && row(item, entry.index, entry.top - base)
      if (element === undefined) continue
      if (parent === undefined) drawn.push(element)
      else parent.append(element)
    }
    inner.replaceChildren(...drawn)
    input.setAttribute('aria-activedescendant', matches.length > 0 ? `views-row-${selected}` : '')
  }

  function drawNotice() {
    const view = currentView()
    const snapshot = view && snapshotOf(view.id)
    notice.replaceChildren()
    notice.classList.remove('setup')
    setupButton = undefined
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
      setupButton = open
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
      const filtered =
        query !== '' ||
        (onlyPending && view.kind === 'mergeRequest') ||
        projects.chosen() !== undefined
      show(t(filtered ? 'views.empty.filtered' : view.empty))
    }
  }

  // What was just copied holds the header's status for a moment; the element announces it as well
  let copiedKey: string | undefined
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  function drawStatus() {
    if (copiedKey !== undefined) {
      status.textContent = t('views.copied', { key: copiedKey })
      return
    }
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
    const tasks = currentKind() === 'issue'
    projects.update(tasks ? items : [])
    const found = filterViewItems(items, {
      query,
      // Only a merge request can need attention, so the toggle does not empty another kind of tab
      onlyPending: onlyPending && currentKind() === 'mergeRequest',
      project: projects.chosen(),
    }).filter((item) => DRAWN_KINDS.has(item.kind))
    layout = layOutList(tasks ? groupByProgress(found) : [{ category: undefined, items: found }])
    matches = layout.items
    // A typed key selects its task even when it sits in a later section; otherwise the first row
    const best = found[0]
    const wanted = keepId ?? (best && matchesReference(best, query) ? best.id : matches[0]?.id)
    const index = wanted === undefined ? -1 : matches.findIndex((item) => item.id === wanted)
    selected = Math.max(0, index)
    redraw()
    if (keepId === undefined) reveal()
  }

  function redraw() {
    pendingButton.setAttribute('aria-pressed', String(onlyPending))
    // Only a merge request can need attention
    pendingButton.hidden = currentKind() !== 'mergeRequest'
    drawKindTexts()
    // With nothing connected there is nothing to filter, switch or refresh: only the way to Connections
    const empty = connectedViews().length === 0
    tabs.hidden = empty
    heading.hidden = !empty
    status.hidden = empty
    bar.hidden = empty
    hint.hidden = empty
    drawTabs()
    drawStatus()
    drawNotice()
    drawList()
    placeFocus()
  }

  // The filter has the focus while there is something to filter, the Connections button otherwise
  function placeFocus() {
    if (!isOpen()) return
    const active = document.activeElement
    if (setupButton) {
      if (active === input || !box.contains(active)) setupButton.focus()
    } else if (!box.contains(active)) input.focus()
  }

  function schedule() {
    if (frame === 0)
      frame = requestAnimationFrame(() => {
        frame = 0
        drawList()
      })
  }

  function reveal() {
    const { top, bottom } = rowSpan(layout, selected)
    const height = list.clientHeight || ROW_HEIGHT * 8
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + height) list.scrollTop = bottom - height
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

  // The key is what goes in a commit message, a branch name or a chat
  function copy(item: IssueItem) {
    void api.clipboard.writeText(item.key).then(() => {
      copiedKey = item.key
      drawStatus()
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        copiedKey = undefined
        drawStatus()
      }, COPIED_MS)
    })
  }

  function copySelected() {
    const item = matches[selected]
    if (item?.kind === 'issue') copy(item)
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
    serviceOf = new Map(
      connectors.flatMap((connector) => connector.views.map((view) => [view.id, connector.name])),
    )
    for (const view of snapshots.keys())
      if (!views.some((known) => known.id === view)) snapshots.delete(view)
  }

  function close() {
    overlay.classList.remove('open')
    clearTimeout(copiedTimer)
    copiedKey = undefined
    query = ''
    input.value = ''
    onlyPending = false
    projects.reset()
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
    // With text in the filter they move the caret, as ← and → do
    else if (key === 'Home' && query === '') move(-matches.length)
    else if (key === 'End' && query === '') move(matches.length)
    else if (key === 'Enter') openSelected()
    else if ((key === 'ArrowLeft' || key === 'ArrowRight') && query === '') {
      const step = key === 'ArrowRight' ? 1 : -1
      const ids = connectedViews().map((view) => view.id)
      const index = current === undefined ? -1 : ids.indexOf(current)
      const next = ids[(index + step + ids.length) % ids.length]
      if (next !== undefined) switchView(next)
    } else if (event.ctrlKey && key.toLowerCase() === 'r') refresh()
    else if (event.ctrlKey && !event.shiftKey && key.toLowerCase() === 'p') {
      if (currentKind() === 'mergeRequest') {
        onlyPending = !onlyPending
        refilter()
      }
    } else if (
      event.ctrlKey &&
      !event.shiftKey &&
      key.toLowerCase() === 'c' &&
      currentKind() === 'issue' &&
      input.selectionStart === input.selectionEnd
    ) {
      // Text selected in the filter is copied as usual
      copySelected()
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
    if (isOpen()) (setupButton ?? input).focus()
  })
  // The filter handles its own keys; anywhere else in the box Escape still closes the screen
  box.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.target === input) return
    event.preventDefault()
    event.stopPropagation()
    close()
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
      projects.retranslate()
      drawStatic()
      if (isOpen()) redraw()
    },
  }
}
