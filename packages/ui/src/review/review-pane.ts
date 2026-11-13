import {
  type AgentState,
  changeRows,
  type DiffFile,
  type DiffGap,
  type DiffOutcome,
  type DiffScope,
  type ErrorBody,
  errorCodeOf,
  type HostApi,
  type Orientation,
  type PaneGrid,
  type Translator,
} from '@dck/core'
import { tokens } from '@dck/design'
import { actionHint, hintBar, keyHint } from '../kit/panel-frame.ts'
import { createSelect } from '../kit/select.ts'
import { h, icon } from '../panel/dom.ts'
import { displayPath } from '../panel/format.ts'
import { REVIEW_KEY } from '../tabs/attention-mark.ts'
import { createDiffView, LINE_HEIGHT } from './diff-view.ts'
import { counts, createFileList } from './file-list.ts'
import { createReviewRefresh } from './review-refresh.ts'

// Loads this fast never show "Reading the changes", so the pane does not flash
const LOADING_TEXT_MS = 200

export const LAYOUT_KEY = 'Ctrl+Shift+E'

const ICONS = {
  whitespace:
    '<path d="M4 7h16M4 12h10M4 17h7"/><path d="M15 17h1.5M19 17h1" stroke-dasharray="0"/>',
  terminal:
    '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15H17"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  index:
    '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M9.5 4.5v15M5.5 8.5h1.5M5.5 11.5h1.5M5.5 14.5h1.5"/>',
  side: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M12 4.5v15"/>',
  stacked: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 12h18"/>',
} as const

// The review's diff font, for the orientation rule: 12px of the mono font on 20px rows, with the two line
// numbers, the sign, the code's end padding and the scrollbar strips on both sides around the text
const DIFF_FONT = `12px ${tokens.font.mono}`
const GUTTER_COLUMNS = 8
const GUTTER_PIXELS = 64
const USUAL_CHROME = 72

type PaneState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'no-folder' }
  | { readonly kind: 'error'; readonly error: ErrorBody }
  | DiffOutcome

// What a window session remembers across the reviews of its tabs
export interface ReviewMemory {
  indexHidden: boolean
}

export interface ReviewPaneDeps {
  // A prefix for the ids inside, unique in the window
  readonly id: string
  readonly api: HostApi
  readonly i18n: Translator
  readonly memory: ReviewMemory
  // The modifier that opens a path with a click, by name (Ctrl, or Cmd on macOS)
  readonly modifier: string
  isModified(event: MouseEvent): boolean
  // The tab's folder right now, or undefined when it is not known
  cwd(): Promise<string | undefined>
  // Esc: the keys go back to the terminal, the review stays
  onEscape(): void
  onClose(): void
  // The header's layout button: the other orientation, as the user's choice
  onToggleLayout(): void
}

let measured: number | undefined
function diffCellWidth(): number {
  if (measured !== undefined) return measured
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return 7.2
  context.font = DIFF_FONT
  const width = context.measureText('0'.repeat(100)).width / 100
  if (width > 0) measured = width
  return width > 0 ? width : 7.2
}

// The review of one tab: scope and totals on top, the index of the changed files, every file's diff in
// one scroll, and the keys
export function createReviewPane(deps: ReviewPaneDeps) {
  const { api, i18n } = deps
  const t = i18n.t
  let scope: DiffScope = 'uncommitted'
  let ignoreWhitespace = false
  let state: PaneState = { kind: 'loading' }
  let busy = false
  let showLoading = false
  let base: string | undefined
  let cwd: string | undefined
  let orientation: Orientation | undefined
  let focusInside = false
  // The next drawing starts the diff at the top: a new scope or whitespace setting is a new reading
  let resetReading = true
  // Per file path: the gaps the user opened, the text that fills them and the collapse they lifted
  const expanded = new Map<string, Set<number>>()
  const texts = new Map<string, readonly string[]>()
  const shownAnyway = new Set<string>()
  // A file whose hunks moved since the last read loses its open gaps, which named the old hunks
  const shapes = new Map<string, string>()
  let drawnBase: string | undefined

  const scopeLabel = h('span', { id: `${deps.id}-scope-label`, hidden: true })
  const select = createSelect({
    id: `${deps.id}-scope`,
    options: [],
    value: scope,
    labelledBy: scopeLabel.id,
    onChange: (value) => {
      scope = value === 'branch' ? 'branch' : 'uncommitted'
      resetReading = true
      refresh.request()
    },
  })
  const totals = h('span', { class: 'rv-totals' })
  const status = h('span', { class: 'rv-status', role: 'status' })
  const iconButton = (svg: string, size: number, extra: Record<string, string> = {}) =>
    h('button', { type: 'button', class: 'rv-icon', ...extra }, icon(svg, size))
  const indexToggle = iconButton(ICONS.index, 16, { 'aria-controls': `${deps.id}-files` })
  const whitespace = iconButton(ICONS.whitespace, 16, { 'aria-pressed': 'false' })
  const layout = iconButton(ICONS.stacked, 16, { 'data-tip-key': LAYOUT_KEY })
  const back = iconButton(ICONS.terminal, 16, { 'data-tip-key': 'Esc' })
  const close = iconButton(ICONS.close, 14, { 'data-tip-key': REVIEW_KEY })
  back.hidden = true
  layout.hidden = true
  const head = h(
    'div',
    { class: 'rv-head' },
    scopeLabel,
    select.element,
    totals,
    status,
    h('span', { class: 'rv-spacer' }),
    indexToggle,
    whitespace,
    layout,
    back,
    close,
  )

  const list = createFileList({
    id: deps.id,
    i18n,
    onSelect: (index) => diff.revealFile(index),
    onOpen: () => diff.focus(),
  })
  list.element.id = `${deps.id}-files`
  const diff = createDiffView({
    id: deps.id,
    i18n,
    modifier: deps.modifier,
    isModified: deps.isModified,
    open: (path) => state.kind === 'ok' && api.paths.openFile(`${state.diff.root}/${path}`),
    expand: (file, gap) => void expand(file, gap),
    showAnyway(file) {
      shownAnyway.add(file.path)
      drawDiff()
    },
    onCurrentFile: (index) => list.highlight(index),
  })
  const body = h('div', { class: 'rv-body' }, list.element, diff.element)
  const message = h('div', { class: 'rv-state' })
  const hints = hintBar()
  const element = h(
    'section',
    { class: 'review', id: deps.id, tabindex: '-1' },
    head,
    body,
    message,
    hints,
  )

  const files = (): readonly DiffFile[] => (state.kind === 'ok' ? state.diff.files : [])

  const refresh = createReviewRefresh({
    load,
    after(milliseconds, task) {
      const timer = setTimeout(task, milliseconds)
      return () => clearTimeout(timer)
    },
  })

  async function load() {
    busy = true
    const loadingTimer = setTimeout(() => {
      showLoading = true
      draw()
    }, LOADING_TEXT_MS)
    drawStatus()
    cwd = await deps.cwd()
    const result = cwd
      ? await api.review.diff({ cwd, scope, ignoreWhitespace })
      : { ok: true as const, value: undefined }
    clearTimeout(loadingTimer)
    busy = false
    showLoading = false
    if (!result.ok) state = { kind: 'error', error: result.error }
    else if (result.value === undefined) state = { kind: 'no-folder' }
    else state = result.value
    if (state.kind === 'ok') {
      base = state.diff.base ?? base
      texts.clear()
      for (const file of state.diff.files) {
        const shape = file.hunks.map((hunk) => `${hunk.newStart},${hunk.newCount}`).join(' ')
        if (shapes.get(file.path) !== shape) expanded.delete(file.path)
        shapes.set(file.path, shape)
      }
    }
    draw()
  }

  // The unchanged text comes from the working tree once, then every gap of that file opens from it
  async function expand(file: DiffFile, gap: DiffGap) {
    if (state.kind !== 'ok') return
    const opened = expanded.get(file.path) ?? new Set<number>()
    opened.add(gap.id)
    expanded.set(file.path, opened)
    if (!texts.has(file.path)) {
      const lines = await api.review.fileLines(state.diff.root, file.path)
      if (!lines.ok) {
        opened.delete(gap.id)
        return
      }
      texts.set(file.path, lines.value)
    }
    drawDiff()
  }

  function drawStatic() {
    drawnBase = base
    scopeLabel.textContent = t('review.scope')
    element.setAttribute('aria-label', t('review.title'))
    whitespace.dataset.tip = t('review.whitespace')
    whitespace.setAttribute('aria-label', t('review.whitespace'))
    back.dataset.tip = t('review.terminal')
    back.setAttribute('aria-label', t('review.terminal'))
    close.dataset.tip = t('review.close')
    close.setAttribute('aria-label', t('review.close'))
    select.setOptions([
      { value: 'uncommitted', label: t('review.scope.uncommitted') },
      {
        value: 'branch',
        label: base ? t('review.scope.branchBase', { base }) : t('review.scope.branch'),
      },
    ])
    select.setValue(scope)
    drawIndexToggle()
    drawLayoutToggle()
    hintsFor = undefined
  }

  function drawIndexToggle() {
    const hidden = deps.memory.indexHidden
    const name = t(hidden ? 'review.index.show' : 'review.index.hide')
    indexToggle.dataset.tip = name
    indexToggle.setAttribute('aria-label', name)
    indexToggle.setAttribute('aria-expanded', String(!hidden))
    list.element.hidden = hidden
    body.toggleAttribute('data-index-hidden', hidden)
  }

  // The button shows and names the other orientation, the one it switches to
  function drawLayoutToggle() {
    layout.hidden = orientation === undefined
    const next = orientation === 'side' ? 'stacked' : 'side'
    const name = t(next === 'stacked' ? 'review.layout.stacked' : 'review.layout.side')
    layout.dataset.tip = name
    layout.setAttribute('aria-label', name)
    layout.replaceChildren(icon(ICONS[next], 16))
  }

  // The keys of the review while it has the focus; from the terminal, only the key that comes back here
  let hintsFor: string | undefined
  function drawHints() {
    const withFiles = state.kind === 'ok' && state.diff.files.length > 0
    const key = `${withFiles} ${focusInside}`
    if (hintsFor === key) return
    hintsFor = key
    if (!focusInside) {
      const come = actionHint(REVIEW_KEY, t('review.hint.review'))
      come.addEventListener('click', () => pane.focus())
      hints.replaceChildren(come)
      return
    }
    const refreshAction = actionHint('Ctrl+R', t('review.refresh'))
    refreshAction.addEventListener('click', () => refresh.request())
    hints.replaceChildren(
      ...(withFiles
        ? [
            keyHint('↑↓', t('review.hint.navigate')),
            keyHint('[ ]', t('review.hint.file')),
            keyHint('n p', t('review.hint.hunk')),
          ]
        : []),
      keyHint('Esc', t('review.hint.terminal')),
      refreshAction,
    )
  }

  function drawStatus() {
    status.textContent = busy && state.kind === 'ok' ? t('review.refreshing') : ''
  }

  function drawTotals() {
    if (state.kind !== 'ok' || state.diff.files.length === 0) {
      totals.replaceChildren()
      return
    }
    const { diff: found } = state
    totals.replaceChildren(
      h('span', {}, i18n.plural('review.files', found.files.length)),
      counts(found.additions, found.deletions),
    )
  }

  function showMessage(title: string, text?: string, action?: HTMLElement) {
    body.hidden = true
    message.hidden = false
    message.replaceChildren(
      ...[
        h('strong', {}, title),
        text === undefined ? undefined : h('span', {}, text),
        action,
      ].filter((child) => child !== undefined),
    )
  }

  function retryButton() {
    const button = h('button', { type: 'button', class: 'vbtn' }, t('review.retry'))
    button.addEventListener('click', () => refresh.request())
    return button
  }

  function drawDiff() {
    const found = files()
    const rows = changeRows(found, (file) => ({
      expanded: expanded.get(file.path) ?? new Set(),
      text: texts.get(file.path),
      shownAnyway: shownAnyway.has(file.path),
    }))
    diff.show(found, rows, resetReading)
    resetReading = false
  }

  function drawState() {
    const folder = cwd ? displayPath(cwd) : ''
    if (state.kind === 'loading') {
      body.hidden = true
      message.hidden = !showLoading
      message.replaceChildren(h('span', {}, t('review.loading')))
      return
    }
    if (state.kind === 'no-folder')
      return showMessage(t('review.notRepository'), t('review.noFolder'))
    if (state.kind === 'not-repository')
      return showMessage(
        t('review.notRepository'),
        t('review.notRepository.text', { path: folder }),
      )
    if (state.kind === 'no-base') return showMessage(t('review.noBase'), t('review.noBase.text'))
    if (state.kind === 'error') {
      const retry = retryButton()
      showMessage(t(`error.${errorCodeOf(state.error)}`), t('review.error'), retry)
      if (focusInside) retry.focus()
      return
    }
    // The Branch option names its base once a read found it
    if (base !== drawnBase) drawStatic()
    if (state.diff.files.length === 0) {
      return showMessage(
        scope === 'branch'
          ? t('review.empty.branch', { base: state.diff.base ?? '' })
          : t('review.empty.uncommitted'),
        t('review.empty.text', { path: displayPath(state.diff.root) }),
      )
    }
    body.hidden = false
    message.hidden = true
    list.show(files(), Math.max(0, list.selected()))
    drawDiff()
  }

  function draw() {
    drawStatus()
    drawTotals()
    // Outside a repository there is no scope to pick or whitespace to hide
    const repository = state.kind !== 'not-repository' && state.kind !== 'no-folder'
    select.element.hidden = !repository
    whitespace.hidden = !repository || state.kind === 'no-base'
    const withFiles = state.kind === 'ok' && state.diff.files.length > 0
    indexToggle.hidden = !withFiles
    drawState()
    drawHints()
    // A focused list or diff that a new state hid would leave the keys on the page's body
    if (focusInside && !element.contains(document.activeElement)) pane.focus()
  }

  function keyTarget(target: EventTarget | null) {
    if (target === list.element) return 'index'
    if (target === diff.element) return 'diff'
    return undefined
  }

  // Keys of the whole pane; the index and the diff handle their own arrows first
  element.addEventListener('keydown', (event) => {
    const { key } = event
    const where = keyTarget(event.target)
    if (key === 'Escape') deps.onEscape()
    else if (event.ctrlKey && !event.shiftKey && !event.altKey && key.toLowerCase() === 'r')
      refresh.request()
    else if (event.ctrlKey || event.altKey || event.metaKey || where === undefined) return
    else if (key === ']' || key === '[') {
      const step = key === ']' ? 1 : -1
      if (where === 'index') list.select(list.selected() + step)
      else diff.nextFile(step)
    } else if (key === 'n' || key === 'p') {
      diff.nextHunk(key === 'n' ? 1 : -1)
      if (where === 'index') diff.focus()
    } else return
    event.preventDefault()
    event.stopPropagation()
  })
  // Where the keys are decides the hints: the review's own, or the way back to it
  element.addEventListener('focusin', () => {
    focusInside = true
    drawHints()
  })
  element.addEventListener('focusout', (event) => {
    const next = event.relatedTarget
    if (next instanceof Node && element.contains(next)) return
    if (next === null) return
    focusInside = false
    drawHints()
  })
  whitespace.addEventListener('click', () => {
    ignoreWhitespace = !ignoreWhitespace
    whitespace.setAttribute('aria-pressed', String(ignoreWhitespace))
    expanded.clear()
    resetReading = true
    refresh.request()
  })
  indexToggle.addEventListener('click', () => {
    deps.memory.indexHidden = !deps.memory.indexHidden
    drawIndexToggle()
    diff.redraw()
  })
  layout.addEventListener('click', () => deps.onToggleLayout())
  back.addEventListener('click', () => deps.onEscape())
  close.addEventListener('click', () => deps.onClose())

  const pane = {
    element,
    open() {
      refresh.open()
      diff.unpark()
    },
    // The reading stays: reopened in the same tab, the review is where it was left
    close() {
      diff.park()
      refresh.close()
    },
    // The diff or the index, whichever had the keys last, else the pane so Esc and Ctrl+R still work
    focus() {
      if (!body.hidden && files().length > 0) {
        if (lastFocus === 'index' && !list.element.hidden) list.focus()
        else diff.focus()
      } else element.focus()
    },
    hasFocus: () => element.contains(document.activeElement),
    agentState: (agent: AgentState | undefined) => refresh.agentState(agent),
    // How the tab shows the review: beside or below the terminal, or alone in a narrow tab
    setArrangement(next: Orientation | undefined, narrow: boolean) {
      orientation = next
      back.hidden = !narrow
      drawLayoutToggle()
      element.dataset.orientation = orientation ?? 'alone'
    },
    // The grid of the diff, for the orientation rule
    grid(): PaneGrid {
      const cellWidth = diffCellWidth()
      const chrome = head.offsetHeight + hints.offsetHeight
      return {
        cellWidth,
        cellHeight: LINE_HEIGHT,
        frameWidth: GUTTER_COLUMNS * cellWidth + GUTTER_PIXELS,
        frameHeight: chrome > 0 ? chrome : USUAL_CHROME,
      }
    },
    retranslate() {
      drawStatic()
      draw()
    },
  }
  let lastFocus: 'index' | 'diff' = 'diff'
  list.element.addEventListener('focus', () => {
    lastFocus = 'index'
  })
  diff.element.addEventListener('focus', () => {
    lastFocus = 'diff'
  })

  drawStatic()
  draw()

  return pane
}

export type ReviewPane = ReturnType<typeof createReviewPane>
