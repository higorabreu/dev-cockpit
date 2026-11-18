import {
  type ChangeRow,
  type CommentTarget,
  changedPairs,
  type DiffFile,
  type DiffGap,
  type DiffLine,
  extendSelection,
  gapSize,
  isCollapsed,
  isSelected,
  type LineSelection,
  selectionTarget,
  selectLine,
  visibleRange,
} from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import { EDITOR_HEIGHT } from './comment-card.ts'
import { type FileHeadDeps, fileHead, fileLabel } from './file-head.ts'
import { type LineMarks, type Mark, wordMarks } from './word-marks.ts'

export const LINE_HEIGHT = 20
export const HUNK_HEIGHT = 26
// A file's header is a 32px band with 8px of air above it, which parts it from the file before
export const FILE_GAP = 8
export const FILE_BAND = 32
export const FILE_HEIGHT = FILE_GAP + FILE_BAND
const OVERSCAN = 12
const PAGE = 20
const TAB_COLUMNS = 4
const UNFOLD = '<path d="M12 3v6M9 6l3 3 3-3M12 21v-6M9 18l3-3 3 3M5 12h14"/>'
const PLUS = '<path d="M12 6v12M6 12h12"/>'

// The pending comments the diff draws under their lines, and the one comment field
export interface DiffComments {
  // A comment's card, drawn anew with its row
  card(id: string): HTMLElement | undefined
  label(id: string): string
  // A card's height until it is measured on screen
  estimate(id: string): number
  // The field and the comment it writes; the same element while it is open, so it keeps its focus
  editor(): { readonly id: string; readonly element: HTMLElement } | undefined
  focusField(): void
  edit(id: string): void
  remove(id: string): void
}

export interface DiffViewDeps extends Omit<FileHeadDeps, 'showAnyway' | 'load'> {
  readonly id: string
  readonly comments: DiffComments
  // The gutter's "+": the comment field for these lines
  comment(target: CommentTarget): void
  expand(file: DiffFile, gap: DiffGap): void
  showAnyway(file: DiffFile): void
  load(file: DiffFile): void
  // The file the diff is on changed: the one at its top, or the one the keys went to
  onCurrentFile(index: number): void
}

const columnsOf = (text: string) => {
  let tabs = 0
  for (const char of text) if (char === '\t') tabs += 1
  return text.length + tabs * (TAB_COLUMNS - 1)
}

// Every file of the change in one virtualized scroll: only the rows in view exist, so 10 000 lines scroll
// like 50. Each file's rows sit in a group named after the file, its header first; the header of the file
// being read stays pinned on top. A cursor row follows the keys and is what a screen reader reads
export function createDiffView(deps: DiffViewDeps) {
  const { i18n } = deps
  const t = i18n.t
  const inner = h('div', { class: 'rv-inner' })
  const pin = h('div', { class: 'rv-pin', 'aria-hidden': 'true', hidden: true })
  // The comment field floats over its row, outside the rows a scroll draws anew, so it keeps its focus
  const editorHost = h('div', { class: 'rv-editor-host', hidden: true })
  const element = h(
    'div',
    { class: 'rv-lines scroll scroll-edges', role: 'listbox', tabindex: '0' },
    pin,
    inner,
    editorHost,
  )
  let files: readonly DiffFile[] = []
  let rows: readonly ChangeRow[] = []
  let tops: number[] = []
  // The row index of each file's header
  let starts: number[] = []
  let cursor = 0
  let frame = 0
  let current = -1
  // The file the keys or the index went to; kept until the user scrolls by hand
  let target: number | undefined
  // Where this view last scrolled to by itself, to tell its own scrolls from the user's
  let expectedTop = 0
  let pinned: { file: number; row: ChangeRow } | undefined
  let viewWidth = 0
  let scrollX = 0
  let parked: { top: number; left: number } | undefined
  // Removed and added lines that replace each other, per file and hunk, and their marks once computed
  let partners = new Map<string, Map<number, number>>()
  let marks = new Map<string, LineMarks>()
  // The lines picked for a comment, and where each line and comment row is
  let selection: LineSelection | undefined
  let lineRows = new Map<string, number>()
  let commentRows = new Map<string, number>()
  // Each card's height once on screen, for the width it was measured at
  let measured = new Map<string, number>()
  let measuredWidth = 0
  let totalHeight = 0

  const lineKey = (file: number, hunk: number, line: number) => `${file}:${hunk}:${line}`
  const commentHeight = (id: string) =>
    deps.comments.editor()?.id === id
      ? EDITOR_HEIGHT
      : (measured.get(id) ?? deps.comments.estimate(id))
  const heightOf = (row: ChangeRow) =>
    row.kind === 'file'
      ? FILE_HEIGHT
      : row.kind === 'hunk' || row.kind === 'gone'
        ? HUNK_HEIGHT
        : row.kind === 'comment'
          ? commentHeight(row.id)
          : LINE_HEIGHT

  const rowId = (index: number) => `${deps.id}-row-${index}`
  const viewHeight = () => element.clientHeight || LINE_HEIGHT * 30

  // The file a row belongs to; the comments of files gone count as the last file
  function fileAtRow(index: number): number {
    const row = rows[index]
    return row ? Math.min(row.file, Math.max(0, files.length - 1)) : 0
  }

  // The file whose rows cover this height of the scroll
  function fileAtTop(y: number): number {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if ((tops[starts[middle] ?? 0] ?? 0) <= y) low = middle
      else high = middle - 1
    }
    return Math.max(0, low)
  }

  function partnerOf(file: number, hunk: number, line: number): number | undefined {
    const key = `${file}:${hunk}`
    let known = partners.get(key)
    if (known === undefined) {
      known = new Map()
      const lines = files[file]?.hunks[hunk]
      if (lines)
        for (const [removed, added] of changedPairs(lines)) {
          known.set(removed, added)
          known.set(added, removed)
        }
      partners.set(key, known)
    }
    return known.get(line)
  }

  function marksOf(file: number, hunk: number, index: number, line: DiffLine): readonly Mark[] {
    const partner = partnerOf(file, hunk, index)
    const other = partner === undefined ? undefined : files[file]?.hunks[hunk]?.lines[partner]
    if (partner === undefined || other === undefined) return []
    const removedIndex = line.kind === 'remove' ? index : partner
    const key = `${file}:${hunk}:${removedIndex}`
    let found = marks.get(key)
    if (found === undefined) {
      found =
        line.kind === 'remove' ? wordMarks(line.text, other.text) : wordMarks(other.text, line.text)
      marks.set(key, found)
    }
    return line.kind === 'remove' ? found.removed : found.added
  }

  function code(text: string, lineMarks: readonly Mark[]): HTMLElement {
    const span = h('span', { class: 'rv-code' })
    let at = 0
    for (const mark of lineMarks) {
      if (mark.start > at) span.append(text.slice(at, mark.start))
      span.append(h('span', { class: 'rv-word' }, text.slice(mark.start, mark.end)))
      at = mark.end
    }
    if (at < text.length) span.append(text.slice(at))
    return span
  }

  const number = (value: number | undefined) =>
    h('span', { class: 'rv-num' }, value === undefined ? '' : String(value))

  // The numbers and the sign stay in place while a long line scrolls sideways
  const gutter = (old: number | undefined, added: number | undefined, sign: string) =>
    h(
      'span',
      { class: 'rv-gutter' },
      number(old),
      number(added),
      h('span', { class: 'rv-sign', 'aria-hidden': 'true' }, sign),
    )

  function lineLabel(line: DiffLine): string {
    const text = line.text.trim() || ' '
    if (line.kind === 'add') return t('review.a11y.added', { line: line.new ?? 0, text })
    if (line.kind === 'remove') return t('review.a11y.removed', { line: line.old ?? 0, text })
    return t('review.a11y.context', { line: line.new ?? 0, text })
  }

  const headDeps = (): FileHeadDeps => ({
    i18n,
    modifier: deps.modifier,
    isModified: deps.isModified,
    open: deps.open,
    showAnyway: deps.showAnyway,
    load: deps.load,
    viewed: deps.viewed,
    toggleViewed: deps.toggleViewed,
    commentCount: deps.commentCount,
  })

  // The gutter's "+" on a line of the change, shown under the pointer, `c` from the keys
  const addButton = () =>
    h(
      'button',
      {
        type: 'button',
        class: 'rv-add',
        tabindex: '-1',
        'aria-label': t('review.comment.add'),
        'data-tip': t('review.comment.add'),
        'data-tip-key': 'c',
      },
      icon(PLUS, 12),
    )

  // A pending comment's card; the one in the field leaves its row empty for the field to cover
  function drawComment(id: string, attributes: Record<string, string>) {
    const label = deps.comments.label(id)
    if (deps.comments.editor()?.id === id) {
      return h('div', { ...attributes, class: 'rv-row rv-comment', 'aria-label': label })
    }
    return h(
      'div',
      { ...attributes, class: 'rv-row rv-comment', 'data-comment': id, 'aria-label': label },
      h('div', { class: 'rv-card-band' }, deps.comments.card(id)),
    )
  }

  function drawRow(row: ChangeRow, index: number): HTMLElement {
    const attributes = {
      class: 'rv-row',
      role: 'option',
      id: rowId(index),
      'aria-selected': String(index === cursor),
      style: `transform: translateY(${tops[index] ?? 0}px)`,
    }
    const file = files[row.file]
    if (row.kind === 'file') {
      if (!file) return h('div', attributes)
      return h(
        'div',
        {
          ...attributes,
          class: 'rv-row rv-filerow',
          'data-file': String(row.file),
          'aria-label': fileLabel(file, row.notice, i18n, row.viewed),
        },
        fileHead(file, row.notice, headDeps()),
      )
    }
    if (row.kind === 'comment') return drawComment(row.id, attributes)
    if (row.kind === 'gone') {
      const label = t('review.comment.gone')
      return h(
        'div',
        { ...attributes, class: 'rv-row rv-hunk rv-gone', 'aria-label': label },
        h(
          'span',
          { class: 'rv-band' },
          h('span', { class: 'rv-fold' }),
          h('span', { class: 'rv-code' }, label),
        ),
      )
    }
    if (row.kind === 'expand') {
      const label = i18n.plural('review.showLines', gapSize(row.gap))
      return h(
        'div',
        { ...attributes, class: 'rv-row rv-expand', 'aria-label': label },
        h(
          'span',
          { class: 'rv-band' },
          h('span', { class: 'rv-fold' }, icon(UNFOLD, 14)),
          h('span', { class: 'rv-expand-text' }, label),
        ),
      )
    }
    if (row.kind === 'hunk') {
      const hunk = file?.hunks[row.hunk]
      const start = hunk?.newStart ?? 0
      const header = `@@ -${hunk?.oldStart},${hunk?.oldCount} +${start},${hunk?.newCount} @@`
      const section = hunk?.section ?? ''
      return h(
        'div',
        {
          ...attributes,
          class: 'rv-row rv-hunk',
          'aria-label': section
            ? t('review.a11y.hunkIn', { line: start, section })
            : t('review.a11y.hunk', { line: start }),
        },
        h(
          'span',
          { class: 'rv-band' },
          h('span', { class: 'rv-fold' }),
          h(
            'span',
            { class: 'rv-code' },
            header,
            section && h('span', { class: 'rv-section' }, ` ${section}`),
          ),
        ),
      )
    }
    if (row.kind === 'context') {
      return h(
        'div',
        {
          ...attributes,
          'data-kind': 'context',
          'aria-label': t('review.a11y.context', { line: row.new, text: row.text.trim() || ' ' }),
        },
        gutter(row.old, row.new, ''),
        code(row.text, []),
      )
    }
    const line = file?.hunks[row.hunk]?.lines[row.line]
    if (line === undefined) return h('div', attributes)
    const sign = line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ''
    const selected = isSelected(selection, row.file, row.hunk, row.line)
    const side = gutter(line.old, line.new, sign)
    side.append(addButton())
    return h(
      'div',
      {
        ...attributes,
        'data-kind': line.kind,
        'data-selected': selected ? 'true' : undefined,
        'aria-label': selected
          ? t('review.a11y.selected', { line: lineLabel(line) })
          : lineLabel(line),
      },
      side,
      code(line.text, line.kind === 'context' ? [] : marksOf(row.file, row.hunk, row.line, line)),
    )
  }

  // The header of the file being read stays on top until the next file's header pushes it away
  function drawPin() {
    const top = element.scrollTop
    const file = fileAtTop(top)
    const start = starts[file]
    const row = start === undefined ? undefined : rows[start]
    const bandTop = (tops[start ?? 0] ?? 0) + FILE_GAP
    if (row?.kind !== 'file' || top <= bandTop) {
      pin.hidden = true
      return
    }
    pin.hidden = false
    if (pinned?.file !== file || pinned.row !== row) {
      const head = files[file]
      pinned = { file, row }
      pin.replaceChildren(head ? fileHead(head, row.notice, headDeps()) : '')
    }
    const next = starts[file + 1]
    const nextBand = next === undefined ? Number.POSITIVE_INFINITY : (tops[next] ?? 0) + FILE_GAP
    const push = Math.min(0, nextBand - top - FILE_BAND)
    pin.style.transform = push === 0 ? '' : `translateY(${push}px)`
  }

  function draw() {
    const { start, end } = visibleRange({
      tops,
      scrollTop: element.scrollTop,
      viewportHeight: viewHeight(),
      overscan: OVERSCAN,
    })
    const indexes: number[] = []
    // The cursor row always exists, so the screen reader's active row is in the page
    if (rows.length > 0 && (cursor < start || cursor >= end)) indexes.push(cursor)
    for (let index = start; index < end; index++) indexes.push(index)
    indexes.sort((a, b) => a - b)
    const groups: HTMLElement[] = []
    let group: HTMLElement | undefined
    let groupFile = -1
    for (const index of indexes) {
      const row = rows[index]
      if (!row) continue
      if (row.file !== groupFile || !group) {
        groupFile = row.file
        const file = files[row.file]
        const header = rows[starts[row.file] ?? 0]
        group = h('div', {
          role: 'group',
          'aria-label': file
            ? fileLabel(file, header?.kind === 'file' ? header.notice : undefined, i18n)
            : t('review.comment.gone'),
        })
        groups.push(group)
      }
      group.append(drawRow(row, index))
    }
    inner.replaceChildren(...groups)
    if (rows.length > 0) element.setAttribute('aria-activedescendant', rowId(cursor))
    else element.removeAttribute('aria-activedescendant')
    const width = element.clientWidth
    if (width !== viewWidth) {
      viewWidth = width
      inner.style.setProperty('--rv-view', `${width}px`)
    }
    drawPin()
    drawEditor()
    const now = target ?? fileAtTop(element.scrollTop + 1)
    if (now !== current && files.length > 0) {
      current = now
      deps.onCurrentFile(now)
    }
    if (measureCards()) {
      layout()
      draw()
    }
  }

  // The comment field over its row, following the sideways scroll like the bands
  function drawEditor() {
    const editing = deps.comments.editor()
    const index = editing === undefined ? undefined : commentRows.get(editing.id)
    if (editing === undefined || index === undefined) {
      editorHost.hidden = true
      editorHost.replaceChildren()
      return
    }
    editorHost.hidden = false
    if (editorHost.firstChild !== editing.element) editorHost.replaceChildren(editing.element)
    editorHost.style.height = `${EDITOR_HEIGHT}px`
    editorHost.style.width = viewWidth > 0 ? `${viewWidth}px` : ''
    editorHost.style.transform = `translate(${element.scrollLeft}px, ${tops[index] ?? 0}px)`
  }

  // A card's text wraps to the width, so its height is known once drawn; true when one changed
  function measureCards(): boolean {
    if (viewWidth !== measuredWidth) {
      measuredWidth = viewWidth
      measured = new Map()
    }
    let moved = false
    for (const card of inner.querySelectorAll<HTMLElement>('[data-comment]')) {
      const id = card.dataset.comment ?? ''
      const height = card.offsetHeight
      if (height > 0 && height !== commentHeight(id)) {
        measured.set(id, height)
        moved = true
      }
    }
    return moved
  }

  function schedule() {
    if (frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      draw()
    })
  }

  function scrollTo(top: number) {
    element.scrollTop = Math.max(0, top)
    expectedTop = element.scrollTop
  }

  // A row is read below the pinned header, except a file's own header, which is read at the top
  const readingTop = (index: number) =>
    rows[index]?.kind === 'file' ? (tops[index] ?? 0) : (tops[index] ?? 0) - FILE_BAND

  function reveal() {
    const row = rows[cursor]
    const top = readingTop(cursor)
    const bottom = (tops[cursor] ?? 0) + (row ? heightOf(row) : LINE_HEIGHT)
    if (top < element.scrollTop) scrollTo(top)
    else if (bottom > element.scrollTop + viewHeight()) scrollTo(bottom - viewHeight())
    target = fileAtRow(cursor)
    draw()
  }

  const inView = (index: number) => {
    const top = tops[index] ?? 0
    return top >= element.scrollTop && top < element.scrollTop + viewHeight()
  }

  // After a scroll by hand the keys start from what is on screen, not from a row far away
  function anchorCursor() {
    if (rows.length === 0 || inView(cursor)) return
    const { start } = visibleRange({
      tops,
      scrollTop: element.scrollTop,
      viewportHeight: viewHeight(),
      overscan: 0,
    })
    let index = start
    while (index < rows.length - 1 && (tops[index] ?? 0) < element.scrollTop) index += 1
    cursor = index
  }

  function moveTo(index: number) {
    if (rows.length === 0) return
    selection = undefined
    cursor = Math.max(0, Math.min(rows.length - 1, index))
    reveal()
  }

  function moveBy(step: number) {
    anchorCursor()
    moveTo(cursor + step)
  }

  const lineAt = (index: number) => {
    const row = rows[index]
    return row?.kind === 'line' ? row : undefined
  }

  // Shift+↑↓: the selection grows or shrinks from the cursor's line, inside its hunk
  function extendBy(step: 1 | -1) {
    const from = selection
      ? lineRows.get(lineKey(selection.file, selection.hunk, selection.focus))
      : cursor
    const row = from === undefined ? undefined : lineAt(from)
    if (!row) return moveBy(step)
    const length = files[row.file]?.hunks[row.hunk]?.lines.length ?? 0
    const start = selection ?? selectLine(row.file, row.hunk, row.line)
    selection = extendSelection(start, row.file, row.hunk, start.focus + step, length)
    cursor = lineRows.get(lineKey(selection.file, selection.hunk, selection.focus)) ?? cursor
    reveal()
  }

  // A click picks its line; Shift+click reaches from the picked line to this one
  function pick(index: number, extend: boolean) {
    const row = lineAt(index)
    if (!row) return
    const length = files[row.file]?.hunks[row.hunk]?.lines.length ?? 0
    selection =
      extend && selection
        ? extendSelection(selection, row.file, row.hunk, row.line, length)
        : selectLine(row.file, row.hunk, row.line)
  }

  // The selected lines, else the cursor's line of the change
  function commentTarget(): CommentTarget | undefined {
    if (selection) return selectionTarget(selection)
    const row = lineAt(cursor)
    return row && { file: row.file, hunk: row.hunk, from: row.line, to: row.line }
  }

  // A file read from its header: it lands at the top with the cursor on it
  function revealFile(index: number) {
    const start = starts[index]
    if (start === undefined) return false
    selection = undefined
    cursor = start
    target = index
    scrollTo(tops[start] ?? 0)
    draw()
    return true
  }

  // The next or previous file from the one being read
  function stepFile(step: 1 | -1) {
    anchorCursor()
    const next = (target ?? fileAtRow(cursor)) + step
    if (next < 0 || next >= starts.length) return false
    return revealFile(next)
  }

  // The next or previous hunk header from the cursor, across files; the first hunk of a file shows its
  // header too
  function stepHunk(step: 1 | -1) {
    anchorCursor()
    for (let index = cursor + step; index >= 0 && index < rows.length; index += step) {
      if (rows[index]?.kind !== 'hunk') continue
      selection = undefined
      cursor = index
      const file = fileAtRow(index)
      const fileTop = tops[starts[file] ?? 0] ?? 0
      const top = (tops[index] ?? 0) - FILE_BAND - LINE_HEIGHT
      target = file
      scrollTo(top - fileTop < FILE_HEIGHT + HUNK_HEIGHT ? fileTop : top)
      draw()
      return true
    }
    return false
  }

  function activate() {
    const row = rows[cursor]
    const file = row ? files[row.file] : undefined
    if (row?.kind === 'comment') {
      if (deps.comments.editor()?.id === row.id) deps.comments.focusField()
      else deps.comments.edit(row.id)
      return
    }
    if (!row || !file) return
    if (row.kind === 'expand') deps.expand(file, row.gap)
    else if (row.kind === 'file' && isCollapsed(row.notice)) deps.showAnyway(file)
    else if (row.kind === 'file' && row.notice === 'unloaded') deps.load(file)
  }

  // A new orientation or the index folding changes the visible width the headers and bands span
  new ResizeObserver(schedule).observe(element)
  element.addEventListener(
    'scroll',
    () => {
      if (Math.abs(element.scrollTop - expectedTop) > 1) target = undefined
      if (element.scrollLeft !== scrollX) {
        scrollX = element.scrollLeft
        inner.style.setProperty('--rv-x', `${scrollX}px`)
      }
      schedule()
    },
    { passive: true },
  )
  const rowIndex = (target: EventTarget | null) => {
    const clicked = (target as Element | null)?.closest<HTMLElement>('.rv-row')
    if (!clicked?.id) return undefined
    const index = Number(clicked.id.slice(rowId(0).length - 1))
    return Number.isInteger(index) ? index : undefined
  }
  const onAdd = (target: EventTarget | null) => (target as Element).closest('.rv-add') !== null
  // Shift+click picks lines, not text, and the "+" leaves the focus where it is
  element.addEventListener('mousedown', (event) => {
    const index = rowIndex(event.target)
    const onLine = index !== undefined && lineAt(index) !== undefined
    if (onAdd(event.target) || (event.shiftKey && onLine)) event.preventDefault()
  })
  element.addEventListener('click', (event) => {
    const index = rowIndex(event.target)
    if (index === undefined) return
    cursor = index
    target = fileAtRow(index)
    const row = lineAt(index)
    if (onAdd(event.target)) {
      if (row && !isSelected(selection, row.file, row.hunk, row.line)) pick(index, false)
      draw()
      const chosen = commentTarget()
      if (chosen) deps.comment(chosen)
      return
    }
    pick(index, event.shiftKey)
    if (rows[cursor]?.kind === 'expand') activate()
    else draw()
  })
  element.addEventListener('keydown', (event) => {
    // The comment field's keys are its own
    if (event.target !== element) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const { key } = event
    const row = rows[cursor]
    if (event.shiftKey && (key === 'ArrowDown' || key === 'ArrowUp')) {
      extendBy(key === 'ArrowDown' ? 1 : -1)
    } else if (row?.kind === 'comment' && (key === 'Delete' || key === 'Backspace')) {
      deps.comments.remove(row.id)
    } else if (key === 'ArrowDown') moveBy(1)
    else if (key === 'ArrowUp') moveBy(-1)
    else if (key === 'PageDown') moveBy(PAGE)
    else if (key === 'PageUp') moveBy(-PAGE)
    else if (key === 'Home') moveTo(0)
    else if (key === 'End') moveTo(rows.length - 1)
    else if (key === 'Enter' || key === ' ') activate()
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  // Where each row sits, which rows hold lines and comments, and the widest number and line
  function layout() {
    tops = []
    starts = []
    lineRows = new Map()
    commentRows = new Map()
    let height = 0
    let digits = 1
    let columns = 0
    rows.forEach((row, index) => {
      tops.push(height)
      height += heightOf(row)
      if (row.kind === 'file' || row.kind === 'gone') starts.push(index)
      else if (row.kind === 'comment') commentRows.set(row.id, index)
      else if (row.kind === 'context') {
        digits = Math.max(digits, String(row.new).length, String(row.old).length)
        columns = Math.max(columns, columnsOf(row.text))
      } else if (row.kind === 'line') {
        lineRows.set(lineKey(row.file, row.hunk, row.line), index)
        const line = files[row.file]?.hunks[row.hunk]?.lines[row.line]
        if (line) {
          digits = Math.max(digits, String(line.old ?? line.new ?? 0).length)
          columns = Math.max(columns, columnsOf(line.text))
        }
      }
    })
    totalHeight = height
    inner.style.height = `${height}px`
    inner.style.setProperty('--rv-digits', String(Math.max(3, digits)))
    inner.style.setProperty('--rv-cols', String(columns))
    // The field lines up with the code, past the gutter the rows have
    editorHost.style.setProperty('--rv-digits', String(Math.max(3, digits)))
  }

  // Where the reading was, as a file and a distance into it, so new rows open at the same place
  function anchor() {
    if (rows.length === 0) return undefined
    const file = fileAtTop(element.scrollTop)
    const cursorFile = fileAtRow(cursor)
    return {
      path: files[file]?.path,
      file,
      offset: element.scrollTop - (tops[starts[file] ?? 0] ?? 0),
      cursorPath: files[cursorFile]?.path,
      cursorFile,
      cursorOffset: cursor - (starts[cursorFile] ?? 0),
    }
  }

  return {
    element,
    // Draws the rows of every file; unless `reset`, the reading stays on the same file and line
    show(nextFiles: readonly DiffFile[], nextRows: readonly ChangeRow[], reset: boolean) {
      const kept = reset ? undefined : anchor()
      if (nextFiles !== files) {
        partners = new Map()
        marks = new Map()
      }
      // A new read brings other files: a selection named lines of the old ones
      if (nextFiles !== files) selection = undefined
      files = nextFiles
      rows = nextRows
      pinned = undefined
      layout()
      const height = totalHeight
      element.setAttribute('aria-label', i18n.plural('review.a11y.changes', files.length))
      const fileOf = (path: string | undefined) => files.findIndex((file) => file.path === path)
      if (kept === undefined) {
        cursor = 0
        target = undefined
        current = -1
        scrollTo(0)
        element.scrollLeft = 0
      } else {
        // A file that is gone gives its place to the one that now sits where it was: the next one
        const nearest = (path: string | undefined, index: number) => {
          const found = fileOf(path)
          return found >= 0 ? found : Math.min(index, starts.length - 1)
        }
        const topFile = nearest(kept.path, kept.file)
        const cursorFile = nearest(kept.cursorPath, kept.cursorFile)
        const fileStart = (file: number) => tops[starts[file] ?? 0] ?? 0
        const fileEnd = (file: number) => (file + 1 < starts.length ? fileStart(file + 1) : height)
        const stayed = (path: string | undefined) => fileOf(path) >= 0
        if (topFile >= 0) {
          const offset = stayed(kept.path) ? kept.offset : 0
          scrollTo(fileStart(topFile) + Math.min(offset, fileEnd(topFile) - fileStart(topFile)))
        }
        if (cursorFile >= 0) {
          const last = (starts[cursorFile + 1] ?? rows.length) - 1
          const offset = stayed(kept.cursorPath) ? kept.cursorOffset : 0
          cursor = Math.min((starts[cursorFile] ?? 0) + offset, last)
        } else cursor = 0
        if (target !== undefined && target >= starts.length) target = undefined
      }
      draw()
    },
    clear() {
      files = []
      rows = []
      tops = []
      starts = []
      selection = undefined
      pinned = undefined
      pin.hidden = true
      inner.replaceChildren()
      inner.style.height = '0'
      drawEditor()
    },
    commentTarget() {
      anchorCursor()
      return commentTarget()
    },
    clearSelection() {
      selection = undefined
      draw()
    },
    // Scrolls the comment field into view, below the pinned header
    revealEditor() {
      const editing = deps.comments.editor()
      const index = editing === undefined ? undefined : commentRows.get(editing.id)
      if (index === undefined) return
      const top = (tops[index] ?? 0) - FILE_BAND
      const bottom = (tops[index] ?? 0) + EDITOR_HEIGHT
      if (bottom > element.scrollTop + viewHeight()) scrollTo(bottom - viewHeight())
      else if (top < element.scrollTop) scrollTo(top)
      draw()
    },
    focus: () => element.focus(),
    nextHunk: (step: 1 | -1) => stepHunk(step),
    nextFile: (step: 1 | -1) => stepFile(step),
    revealFile,
    // The file being read: the one the keys went to, else the one at the cursor
    currentFile() {
      anchorCursor()
      return target ?? fileAtRow(cursor)
    },
    // Detached from the page the scroll is lost; it is kept on close and given back on open
    park() {
      parked = { top: element.scrollTop, left: element.scrollLeft }
    },
    unpark() {
      if (!parked) return
      scrollTo(parked.top)
      element.scrollLeft = parked.left
      parked = undefined
      draw()
    },
    redraw: draw,
  }
}

export type DiffView = ReturnType<typeof createDiffView>
