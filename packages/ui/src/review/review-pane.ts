import {
  type AgentState,
  collapseReason,
  type DiffFile,
  type DiffGap,
  type DiffOutcome,
  type DiffScope,
  diffRows,
  type ErrorBody,
  errorCodeOf,
  type HostApi,
  type Translator,
} from '@dck/core'
import { actionHint, hintBar, keyHint } from '../kit/panel-frame.ts'
import { createSelect } from '../kit/select.ts'
import { h, icon } from '../panel/dom.ts'
import { displayPath } from '../panel/format.ts'
import { createDiffView } from './diff-view.ts'
import { fileHead, fileNotice } from './file-head.ts'
import { counts, createFileList } from './file-list.ts'
import { createReviewRefresh } from './review-refresh.ts'

// Loads this fast never show "Reading the changes", so the pane does not flash
const LOADING_TEXT_MS = 200

const ICONS = {
  whitespace:
    '<path d="M4 7h16M4 12h10M4 17h7"/><path d="M15 17h1.5M19 17h1" stroke-dasharray="0"/>',
  terminal:
    '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15H17"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
} as const

type PaneState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'no-folder' }
  | { readonly kind: 'error'; readonly error: ErrorBody }
  | DiffOutcome

export interface ReviewPaneDeps {
  // A prefix for the ids inside, unique in the window
  readonly id: string
  readonly api: HostApi
  readonly i18n: Translator
  // The modifier that opens a path with a click, by name (Ctrl, or Cmd on macOS)
  readonly modifier: string
  isModified(event: MouseEvent): boolean
  // The tab's folder right now, or undefined when it is not known
  cwd(): Promise<string | undefined>
  // Esc: the keys go back to the terminal, the review stays
  onEscape(): void
  onClose(): void
}

// The review of one tab: scope and totals on top, the changed files, the selected file's diff and the keys
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
  let selectedPath: string | undefined
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
      refresh.request()
    },
  })
  const totals = h('span', { class: 'rv-totals' })
  const status = h('span', { class: 'rv-status', role: 'status' })
  const whitespace = h(
    'button',
    { type: 'button', class: 'rv-icon', 'aria-pressed': 'false' },
    icon(ICONS.whitespace, 16),
  )
  const back = h(
    'button',
    { type: 'button', class: 'rv-icon', 'data-tip-key': 'Esc', hidden: true },
    icon(ICONS.terminal, 16),
  )
  const close = h(
    'button',
    { type: 'button', class: 'rv-icon', 'data-tip-key': 'Ctrl+Shift+D' },
    icon(ICONS.close, 14),
  )
  const head = h(
    'div',
    { class: 'rv-head' },
    scopeLabel,
    select.element,
    totals,
    status,
    h('span', { class: 'rv-spacer' }),
    whitespace,
    back,
    close,
  )

  const list = createFileList({
    id: deps.id,
    i18n,
    onSelect: (index) => {
      selectedPath = files()[index]?.path
      drawFile()
    },
    onOpen: () => diff.focus(),
  })
  const diff = createDiffView({ id: deps.id, i18n, expand: (gap) => void expand(gap) })
  const fileTop = h('div', { class: 'rv-file-top' })
  const fileArea = h('div', { class: 'rv-file-area' }, fileTop, diff.element)
  const body = h('div', { class: 'rv-body' }, list.element, fileArea)
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
  const selectedFile = () => files().find((file) => file.path === selectedPath)

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
      // The files keep their place across reads; at first, or when the file is gone, the first one with
      // lines to read is shown, not a binary or a lock file
      if (selectedFile() === undefined) {
        const readable = files().find(
          (file) => file.hunks.length > 0 && !file.binary && collapseReason(file) === undefined,
        )
        selectedPath = (readable ?? files()[0])?.path
      }
    }
    draw()
  }

  // The unchanged text comes from the working tree once, then every gap of that file opens from it
  async function expand(gap: DiffGap) {
    const file = selectedFile()
    if (!file || state.kind !== 'ok') return
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
    if (selectedFile() === file) drawFile()
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
    hintsFor = undefined
  }

  // The file and hunk keys only while there are files; Esc and Ctrl+R always
  let hintsFor: boolean | undefined
  function drawHints(withFiles: boolean) {
    if (hintsFor === withFiles) return
    hintsFor = withFiles
    const refreshAction = actionHint('Ctrl+R', t('review.refresh'))
    refreshAction.addEventListener('click', () => refresh.request())
    hints.replaceChildren(
      ...(withFiles
        ? [
            keyHint('↑↓', t('review.hint.navigate')),
            keyHint('Enter', t('review.hint.diff')),
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

  function drawFile() {
    const file = selectedFile()
    if (!file) {
      fileTop.replaceChildren()
      diff.clear()
      return
    }
    const notice = fileNotice(file, shownAnyway.has(file.path), i18n, () => {
      shownAnyway.add(file.path)
      drawFile()
    })
    fileTop.replaceChildren(
      fileHead(file, {
        i18n,
        modifier: deps.modifier,
        isModified: deps.isModified,
        open: (path) => state.kind === 'ok' && api.paths.openFile(`${state.diff.root}/${path}`),
      }),
      notice ?? '',
    )
    diff.element.hidden = notice !== undefined
    if (notice) return diff.clear()
    const rows = diffRows(file, expanded.get(file.path) ?? new Set(), texts.get(file.path))
    diff.show(file, rows, t('review.a11y.diff', { path: file.path }))
  }

  function draw() {
    drawStatus()
    drawTotals()
    // Outside a repository there is no scope to pick or whitespace to hide
    const repository = state.kind !== 'not-repository' && state.kind !== 'no-folder'
    select.element.hidden = !repository
    whitespace.hidden = !repository || state.kind === 'no-base'
    drawHints(state.kind === 'ok' && state.diff.files.length > 0)
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
      if (document.activeElement === element) retry.focus()
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
    const index = Math.max(
      0,
      files().findIndex((file) => file.path === selectedPath),
    )
    list.show(files(), index)
    drawFile()
    // Opened before the first read, the pane held the focus; the list takes it once there is one
    if (document.activeElement === element) list.focus()
  }

  function stepFile(step: 1 | -1) {
    const next = list.selected() + step
    if (next < 0 || next >= files().length) return false
    list.select(next)
    diff.revealFirstHunk()
    return true
  }

  // Keys of the whole pane; the list and the diff handle their own arrows first
  element.addEventListener('keydown', (event) => {
    const { key } = event
    const inContent = event.target === list.element || event.target === diff.element
    if (key === 'Escape') deps.onEscape()
    else if (event.ctrlKey && !event.shiftKey && !event.altKey && key.toLowerCase() === 'r')
      refresh.request()
    else if (event.ctrlKey || event.altKey || event.metaKey || !inContent) return
    else if (key === ']') stepFile(1)
    else if (key === '[') stepFile(-1)
    else if (key === 'n') {
      // Past the last hunk of a file, the next file's first one
      if (!diff.nextHunk(1) && stepFile(1)) diff.focus()
    } else if (key === 'p') diff.nextHunk(-1)
    else return
    event.preventDefault()
    event.stopPropagation()
  })
  whitespace.addEventListener('click', () => {
    ignoreWhitespace = !ignoreWhitespace
    whitespace.setAttribute('aria-pressed', String(ignoreWhitespace))
    expanded.clear()
    refresh.request()
  })
  back.addEventListener('click', () => deps.onEscape())
  close.addEventListener('click', () => deps.onClose())

  drawStatic()
  draw()

  return {
    element,
    open: () => refresh.open(),
    close: () => refresh.close(),
    // The list when there are files, else the pane itself so Esc and Ctrl+R still work
    focus() {
      if (!body.hidden && files().length > 0) {
        if (document.activeElement !== diff.element) list.focus()
      } else element.focus()
    },
    agentState: (agent: AgentState | undefined) => refresh.agentState(agent),
    setNarrow(narrow: boolean) {
      back.hidden = !narrow
    },
    retranslate() {
      drawStatic()
      draw()
    },
  }
}

export type ReviewPane = ReturnType<typeof createReviewPane>
