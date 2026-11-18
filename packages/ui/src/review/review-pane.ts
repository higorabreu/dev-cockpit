import {
  type AgentState,
  type BranchInfo,
  branchName,
  carryGaps,
  changeRows,
  type DiffFile,
  type DiffGap,
  type DiffOutcome,
  type DiffScope,
  type ErrorBody,
  errorCodeOf,
  type HostApi,
  hunkLines,
  type Orientation,
  type PaneGrid,
  patchKey,
  type ReviewBase,
  type SessionActivityInfo,
  type Translator,
} from '@dck/core'
import { tokens } from '@dck/design'
import { actionHint, hintBar, keyHint } from '../kit/panel-frame.ts'
import { createSelect, type SelectOption } from '../kit/select.ts'
import { h, icon } from '../panel/dom.ts'
import { displayPath } from '../panel/format.ts'
import type { Keymap } from '../platform/keymap.ts'
import { createDiffView, LINE_HEIGHT } from './diff-view.ts'
import { counts, createFileList } from './file-list.ts'
import { watchHead } from './head-fit.ts'
import { createReviewComments } from './review-comments.ts'
import { createReviewRefresh } from './review-refresh.ts'
import { createReviewSend } from './review-send.ts'

// Loads this fast never show "Reading the changes", so the pane does not flash
const LOADING_TEXT_MS = 200
// How long a notice in the header stays
const NOTICE_MS = 8000

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
  readonly keymap: Keymap
  // The tab's folder right now, or undefined when it is not known
  cwd(): Promise<string | undefined>
  // The base the user picked for the repository that holds this folder
  baseFor(cwd: string): string | undefined
  // Keeps the user's base for a repository; undefined goes back to the one found
  chooseBase(root: string, name: string | undefined): Promise<void>
  // Esc: the keys go back to the terminal, the review stays
  onEscape(): void
  onClose(): void
  // The header's layout button: the other orientation, as the user's choice
  onToggleLayout(): void
  // Types a line at the tab's terminal prompt, without Enter, and gives it the keys; false when the
  // terminal could not take it
  send(text: string): boolean
  // What runs in the tab's terminal, read fresh at sending
  activity(): Promise<SessionActivityInfo | undefined>
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
  // A short sentence beside the totals, such as why the comments were not sent
  let notice = ''
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let showLoading = false
  // What the base and unpushed scopes compare with, from the last read of a repository, and that one
  let branch: BranchInfo | undefined
  let root: string | undefined
  let cwd: string | undefined
  let orientation: Orientation | undefined
  let focusInside = false
  // The tab's program reported its state: the marks and the send agree it is an agent
  let reporting = false
  // The next drawing starts the diff at the top: a new scope or whitespace setting is a new reading
  let resetReading = true
  // Per file path: the gaps the user opened, the text that fills them and the collapse they lifted
  const expanded = new Map<string, Set<number>>()
  const texts = new Map<string, readonly string[]>()
  const shownAnyway = new Set<string>()
  // Each file as last read: a file whose hunks moved finds its open gaps again by their old lines
  const lastRead = new Map<string, DiffFile>()
  // Files marked viewed in this tab, per scope and whitespace setting, each tied to the change it had;
  // a mark that went away because the file changed again is remembered to say so
  const viewedMarks = new Map<string, string>()
  const changedSince = new Set<string>()
  const keys = new WeakMap<DiffFile, string>()
  let drawnOptions = ''

  const markId = (path: string) => `${scope}|${ignoreWhitespace ? 'w' : ''}|${path}`
  function keyOf(file: DiffFile): string {
    const known = keys.get(file)
    if (known !== undefined) return known
    const key = patchKey(file)
    keys.set(file, key)
    return key
  }
  const isViewed = (file: DiffFile) => viewedMarks.get(markId(file.path)) === keyOf(file)

  const scopeLabel = h('span', { id: `${deps.id}-scope-label`, hidden: true })
  const select = createSelect({
    id: `${deps.id}-scope`,
    options: [],
    value: scope,
    labelledBy: scopeLabel.id,
    onChange: (value) => void pickScope(value),
  })
  const totals = h('span', { class: 'rv-totals' })
  const status = h('span', { class: 'rv-status', role: 'status' })
  const iconButton = (svg: string, size: number, extra: Record<string, string> = {}) =>
    h('button', { type: 'button', class: 'rv-icon', ...extra }, icon(svg, size))
  const indexToggle = iconButton(ICONS.index, 16, { 'aria-controls': `${deps.id}-files` })
  const whitespace = iconButton(ICONS.whitespace, 16, { 'aria-pressed': 'false' })
  // The keys the user can change are asked of the keymap when the tooltip shows
  const layout = iconButton(ICONS.stacked, 16, { 'data-tip-shortcut': 'reviewLayout' })
  const back = iconButton(ICONS.terminal, 16, { 'data-tip-key': 'Esc' })
  const close = iconButton(ICONS.close, 14, { 'data-tip-shortcut': 'review' })
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

  const comments = createReviewComments({
    i18n,
    editKey: 'Enter',
    deleteKey: deps.keymap.keyboard === 'mac' ? '⌫' : 'Delete',
    saveKey: deps.keymap.commandLabel('Enter'),
    isSave: (event) => deps.keymap.command(event, 'Enter'),
    onChange() {
      sender.draw()
      if (state.kind === 'ok' && state.diff.files.length > 0) drawDiff()
    },
    onOpen() {
      diff.revealEditor()
      comments.focusField()
    },
    onDone() {
      diff.clearSelection()
      diff.focus()
    },
  })

  const sender = createReviewSend({
    api,
    i18n,
    comments,
    root: () => root,
    cwd: deps.cwd,
    activity: deps.activity,
    type: deps.send,
    notice: showNotice,
  })
  // Beside the other header controls, before the index toggle
  head.insertBefore(sender.element, indexToggle)
  watchHead(head, select.element)

  const list = createFileList({
    id: deps.id,
    i18n,
    onSelect: (index) => diff.revealFile(index),
    onOpen: () => diff.focus(),
    isViewed,
  })
  list.element.id = `${deps.id}-files`
  const diff = createDiffView({
    id: deps.id,
    i18n,
    modifier: deps.keymap.click.label,
    isModified: deps.keymap.click.isHeld,
    open: (path) => state.kind === 'ok' && api.paths.openFile(`${state.diff.root}/${path}`),
    expand: (file, gap) => void expand(file, gap),
    showAnyway(file) {
      shownAnyway.add(file.path)
      drawDiff()
    },
    viewed: (file) => ({ viewed: isViewed(file), changed: changedSince.has(markId(file.path)) }),
    toggleViewed: (file) => toggleViewed(file),
    commentCount: (file) => comments.countFor(file.path),
    comments,
    comment: (target) => startComment(target),
    onCurrentFile: (index) => list.highlight(index),
  })
  const body = h('div', { class: 'rv-body' }, list.element, diff.element)
  const message = h('div', { class: 'rv-state' })
  const hints = hintBar()
  new ResizeObserver(() => fitHints()).observe(hints)
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
    fingerprint: async () => {
      const folder = await deps.cwd()
      return folder ? api.review.fingerprint(folder) : undefined
    },
    visible: () => !document.hidden,
    now: () => performance.now(),
    after(milliseconds, task) {
      const timer = setTimeout(task, milliseconds)
      return () => clearTimeout(timer)
    },
  })

  // A quiet read (the change moved, the agent spoke) shows no loading text: the diff just updates
  async function load(quiet: boolean) {
    busy = !quiet
    const loadingTimer = quiet
      ? undefined
      : setTimeout(() => {
          showLoading = true
          draw()
        }, LOADING_TEXT_MS)
    drawStatus()
    cwd = await deps.cwd()
    const chosen = cwd ? deps.baseFor(cwd) : undefined
    const result = cwd
      ? await api.review.diff({
          cwd,
          scope,
          ignoreWhitespace,
          ...(chosen === undefined ? {} : { base: chosen }),
        })
      : { ok: true as const, value: undefined }
    if (loadingTimer) clearTimeout(loadingTimer)
    busy = false
    showLoading = false
    if (!result.ok) state = { kind: 'error', error: result.error }
    else if (result.value === undefined) state = { kind: 'no-folder' }
    else state = result.value
    if (state.kind === 'no-base' || state.kind === 'no-upstream') root = state.root
    if (state.kind === 'ok') {
      // Another repository shares no file; in the same one, a file whose hunks kept their place keeps its
      // opened gaps and their text, since the lines between hunks are the unchanged ones
      if (root !== state.diff.root) {
        texts.clear()
        expanded.clear()
        lastRead.clear()
      }
      const repository = state.diff.root
      root = repository
      branch = state.diff.branch
      const reread: DiffFile[] = []
      for (const file of state.diff.files) {
        const before = lastRead.get(file.path)
        const opened = expanded.get(file.path)
        lastRead.set(file.path, file)
        if (!before || sameShape(before, file)) continue
        texts.delete(file.path)
        if (!opened || opened.size === 0) continue
        expanded.set(file.path, new Set(carryGaps(before, file, opened)))
        reread.push(file)
      }
      // The moved file's text is read again before the draw, so its open gaps never flash shut
      await Promise.all(reread.map((file) => readText(repository, file)))
      reconcileMarks(state.diff.files)
      comments.relocate(state.diff.files)
    }
    draw()
  }

  const shapeOf = (file: DiffFile) =>
    file.hunks.map((hunk) => `${hunk.newStart},${hunk.newCount}`).join(' ')
  const sameShape = (a: DiffFile, b: DiffFile) => shapeOf(a) === shapeOf(b)

  // The working tree's text of a file, which every opened gap of it shows; false when it cannot be read
  async function readText(repository: string, file: DiffFile): Promise<boolean> {
    if (texts.has(file.path)) return true
    const lines = await api.review.fileLines(repository, file.path)
    if (!lines.ok) return false
    texts.set(file.path, lines.value)
    return true
  }

  // The field for the selected lines, or the cursor's line, of a file of the change
  function startComment(target: { file: number; hunk: number; from: number; to: number }) {
    const file = files()[target.file]
    const hunk = file?.hunks[target.hunk]
    if (!file || !hunk) return
    comments.start(file.path, hunkLines(hunk, target.from, target.to), {
      hunk: target.hunk,
      start: target.from,
    })
  }

  function showNotice(text: string) {
    notice = text
    drawStatus()
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      notice = ''
      drawStatus()
    }, NOTICE_MS)
  }

  // The unchanged text comes from the working tree once, then every gap of that file opens from it
  async function expand(file: DiffFile, gap: DiffGap) {
    if (state.kind !== 'ok') return
    const opened = expanded.get(file.path) ?? new Set<number>()
    opened.add(gap.id)
    expanded.set(file.path, opened)
    if (!(await readText(state.diff.root, file))) {
      opened.delete(gap.id)
      return
    }
    drawDiff()
  }

  // Another base is a choice kept for the repository; the one found again goes back to finding it
  async function pickScope(value: string) {
    if (value.startsWith('base:') && root !== undefined) {
      const name = value.slice('base:'.length)
      await deps.chooseBase(root, name === branch?.found?.name ? undefined : name)
      scope = 'branch'
      select.setValue('branch')
    } else scope = value === 'branch' || value === 'unpushed' ? value : 'uncommitted'
    resetReading = true
    refresh.request()
  }

  function baseTip(base: ReviewBase): string {
    if (base.source === 'created') return t('review.base.created', { base: base.name })
    if (base.source === 'vscode') return t('review.base.vscode')
    if (base.source === 'nearest') return t('review.base.nearest')
    return t('review.base.chosen')
  }

  // The base option, disabled with the reason once a read found none
  function baseOption(): SelectOption {
    const base = branch?.base
    if (base) return { value: 'branch', label: since(base.name), tip: baseTip(base) }
    const option = { value: 'branch', label: t('review.scope.base') }
    if (!branch) return option
    const tip = branch.candidates.length > 0 ? t('review.noBase.text') : t('review.noBase')
    return { ...option, tip, disabled: true }
  }

  // The unpushed option, disabled with the reason once a read found no upstream
  function unpushedOption(): SelectOption {
    const option = { value: 'unpushed', label: t('review.scope.unpushed') }
    const upstream = branch?.upstream
    if (!branch) return option
    if (upstream) return { ...option, tip: t('review.scope.unpushed.tip', { upstream }) }
    return { ...option, tip: t('review.scope.noUpstream'), disabled: true }
  }

  const since = (name: string) => t('review.scope.since', { base: name })

  // Uncommitted, since the base, unpushed, then the other bases to pick from
  function scopeOptions(): SelectOption[] {
    const options: SelectOption[] = [
      { value: 'uncommitted', label: t('review.scope.uncommitted') },
      baseOption(),
      unpushedOption(),
    ]
    if (!branch) return options
    const { base, found } = branch
    const listed = new Set(base ? [branchName(base.name)] : [])
    for (const name of [...(found ? [found.name] : []), ...branch.candidates]) {
      if (listed.has(branchName(name))) continue
      listed.add(branchName(name))
      const tip = name === found?.name ? baseTip(found) : undefined
      options.push({ value: `base:${name}`, label: since(name), ...(tip ? { tip } : {}) })
    }
    return options
  }

  function drawScope() {
    const options = scopeOptions()
    const key = JSON.stringify(options)
    if (key === drawnOptions) return
    drawnOptions = key
    select.setOptions(options)
    select.setValue(scope)
  }

  function drawStatic() {
    drawnOptions = ''
    scopeLabel.textContent = t('review.scope')
    element.setAttribute('aria-label', t('review.title'))
    whitespace.dataset.tip = t('review.whitespace')
    whitespace.setAttribute('aria-label', t('review.whitespace'))
    back.dataset.tip = t('review.terminal')
    back.setAttribute('aria-label', t('review.terminal'))
    close.dataset.tip = t('review.close')
    close.setAttribute('aria-label', t('review.close'))
    sender.draw()
    drawScope()
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
    // In the comment field only its own keys apply
    const typing = document.activeElement instanceof HTMLTextAreaElement && focusInside
    // The review's key is in it too: the user may have changed it since the last drawing
    const key = `${withFiles} ${focusInside} ${typing} ${deps.keymap.label('review')}`
    if (hintsFor === key) return
    hintsFor = key
    if (!focusInside) {
      const come = actionHint(deps.keymap.label('review'), t('review.hint.review'))
      come.addEventListener('click', () => pane.focus())
      hints.replaceChildren(come)
      return
    }
    if (typing) {
      hints.replaceChildren(
        keyHint(deps.keymap.commandLabel('Enter'), t('review.hint.save')),
        keyHint('Esc', t('review.hint.cancel')),
      )
      return
    }
    const refreshAction = actionHint(deps.keymap.commandLabel('r'), t('review.refresh'))
    refreshAction.addEventListener('click', () => refresh.request())
    // The number is the order in which a hint gives way when the bar has no room for all of them
    const droppable = (hint: HTMLElement, order: number) => {
      hint.dataset.drop = String(order)
      return hint
    }
    hints.replaceChildren(
      ...(withFiles
        ? [
            droppable(keyHint('↑↓', t('review.hint.navigate')), 5),
            droppable(keyHint('[ ]', t('review.hint.file')), 3),
            droppable(keyHint('n p', t('review.hint.hunk')), 2),
            droppable(keyHint('c', t('review.hint.comment')), 4),
            droppable(keyHint('v', t('review.hint.viewed')), 1),
          ]
        : []),
      keyHint('Esc', t('review.hint.terminal')),
      refreshAction,
    )
    fitHints()
  }

  // The way back to the terminal and Refresh always stay; the review's keys give way one by one
  function fitHints() {
    const droppable = [...hints.querySelectorAll<HTMLElement>('[data-drop]')].sort(
      (a, b) => Number(a.dataset.drop) - Number(b.dataset.drop),
    )
    for (const hint of droppable) hint.hidden = false
    for (const hint of droppable) {
      if (hints.scrollWidth <= hints.clientWidth) return
      hint.hidden = true
    }
  }

  function drawStatus() {
    status.textContent = notice || (busy && state.kind === 'ok' ? t('review.refreshing') : '')
  }

  function drawTotals() {
    if (state.kind !== 'ok' || state.diff.files.length === 0) {
      totals.replaceChildren()
      return
    }
    const { diff: found } = state
    const viewed = found.files.filter(isViewed).length
    const count = found.files.length
    if (viewed === 0) {
      totals.replaceChildren(
        h('span', { class: 'rv-tally' }, i18n.plural('review.files', count)),
        counts(found.additions, found.deletions),
      )
      return
    }
    const full = i18n.plural('review.viewedFiles', count, { viewed })
    // A narrow review shows only the numbers; the whole sentence is in the tooltip
    totals.replaceChildren(
      h('span', { class: 'rv-tally' }, full),
      h(
        'span',
        { class: 'rv-tally-short', 'data-tip': full },
        t('review.viewedFiles.short', { viewed, count }),
      ),
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

  // A viewed file that changed again loses its mark and says so; a file that is gone forgets both
  function reconcileMarks(found: readonly DiffFile[]) {
    const prefix = markId('')
    const byId = new Map(found.map((file) => [markId(file.path), file]))
    for (const [id, key] of viewedMarks) {
      if (!id.startsWith(prefix)) continue
      const file = byId.get(id)
      if (file === undefined) viewedMarks.delete(id)
      else if (keyOf(file) !== key) {
        viewedMarks.delete(id)
        changedSince.add(id)
      }
    }
    for (const id of changedSince)
      if (id.startsWith(prefix) && !byId.has(id)) changedSince.delete(id)
  }

  // Marking a file viewed folds it and moves on to the next file not viewed yet, as on GitHub
  function toggleViewed(file: DiffFile) {
    const found = files()
    const index = found.indexOf(file)
    if (index < 0) return
    const id = markId(file.path)
    const marking = !isViewed(file)
    if (marking) {
      viewedMarks.set(id, keyOf(file))
      changedSince.delete(id)
    } else viewedMarks.delete(id)
    drawDiff()
    drawTotals()
    list.redraw()
    if (!marking) return
    const order = [...found.keys()].map((step) => (index + 1 + step) % found.length)
    const next = order.find((candidate) => {
      const other = found[candidate]
      return other !== undefined && !isViewed(other)
    })
    diff.revealFile(next ?? index)
  }

  function drawDiff() {
    const found = files()
    const gone = comments.gone(new Set(found.map((file) => file.path)))
    const rows = changeRows(
      found,
      (file) => ({
        expanded: expanded.get(file.path) ?? new Set(),
        text: texts.get(file.path),
        shownAnyway: shownAnyway.has(file.path),
        viewed: isViewed(file),
        comments: comments.forFile(file.path),
      }),
      gone,
    )
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
    if (state.kind === 'no-upstream')
      return showMessage(t('review.noUpstream'), t('review.noUpstream.text'))
    if (state.kind === 'error') {
      const retry = retryButton()
      showMessage(t(`error.${errorCodeOf(state.error)}`), t('review.error'), retry)
      if (focusInside) retry.focus()
      return
    }
    // The second option names its base once a read found it
    drawScope()
    if (state.diff.files.length === 0) {
      const { base, upstream } = state.diff.branch
      return showMessage(
        scope === 'unpushed'
          ? t('review.empty.unpushed', { upstream: upstream ?? '' })
          : scope === 'branch'
            ? t('review.empty.branch', { base: base?.name ?? '' })
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
    whitespace.hidden = !repository || state.kind === 'no-base' || state.kind === 'no-upstream'
    const withFiles = state.kind === 'ok' && state.diff.files.length > 0
    indexToggle.hidden = !withFiles
    drawState()
    drawHints()
    // A focused list or diff that a new state hid would leave the keys on the page's body, and the pane
    // itself, focused while it loaded, takes no review key: both hand the keys to the diff or the index
    const resting = document.activeElement === element && withFiles
    if (focusInside && (resting || !element.contains(document.activeElement))) pane.focus()
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
    else if (deps.keymap.command(event, 'r')) refresh.request()
    else if (event.ctrlKey || event.altKey || event.metaKey || where === undefined) return
    else if (key === ']' || key === '[') {
      const step = key === ']' ? 1 : -1
      if (where === 'index') list.select(list.selected() + step)
      else diff.nextFile(step)
    } else if (key === 'n' || key === 'p') {
      diff.nextHunk(key === 'n' ? 1 : -1)
      if (where === 'index') diff.focus()
    } else if (key === 'v') {
      const file = files()[where === 'index' ? list.selected() : diff.currentFile()]
      if (file) toggleViewed(file)
    } else if (key === 'c' && where === 'diff') {
      const target = diff.commentTarget()
      if (target) startComment(target)
    } else return
    event.preventDefault()
    event.stopPropagation()
  })
  // Where the keys are decides the hints: the review's own, or the way back to it
  element.addEventListener('focusin', (event) => {
    focusInside = true
    // A click on a bare part of the pane focuses the pane itself, where the review's keys do nothing
    if (event.target === element && state.kind === 'ok' && state.diff.files.length > 0) {
      pane.focus()
      return
    }
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

  const onVisibility = () => refresh.visibility()
  // A focused child that a redraw removed sends a focusout with no target, so the review cannot tell
  // the keys left it until the focus arrives somewhere else
  const onFocusElsewhere = (event: FocusEvent) => {
    if (!focusInside || (event.target instanceof Node && element.contains(event.target))) return
    focusInside = false
    drawHints()
  }

  const pane = {
    element,
    open() {
      document.addEventListener('visibilitychange', onVisibility)
      document.addEventListener('focusin', onFocusElsewhere)
      refresh.open()
      diff.unpark()
    },
    // The reading stays: reopened in the same tab, the review is where it was left
    close() {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('focusin', onFocusElsewhere)
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
    send: () => sender.send(),
    agentState(agent: AgentState | undefined) {
      reporting = agent !== undefined
      refresh.agentState(agent)
    },
    // The watcher's read of the tab: the send button follows what runs in its terminal
    activity: (info: SessionActivityInfo | undefined) => sender.sync(info, reporting),
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
    // The user changed a key: the hints that show it are drawn again
    keysChanged: () => drawHints(),
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
