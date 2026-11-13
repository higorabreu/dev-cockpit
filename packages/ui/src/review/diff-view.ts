import {
  type ChangeRow,
  changedPairs,
  type DiffFile,
  type DiffGap,
  type DiffLine,
  gapSize,
  isCollapsed,
  visibleRange,
} from '@dck/core'
import { h, icon } from '../panel/dom.ts'
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

export interface DiffViewDeps extends Omit<FileHeadDeps, 'showAnyway'> {
  readonly id: string
  expand(file: DiffFile, gap: DiffGap): void
  showAnyway(file: DiffFile): void
  // The file the diff is on changed: the one at its top, or the one the keys went to
  onCurrentFile(index: number): void
}

const heightOf = (row: ChangeRow) =>
  row.kind === 'file' ? FILE_HEIGHT : row.kind === 'hunk' ? HUNK_HEIGHT : LINE_HEIGHT

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
  const element = h(
    'div',
    { class: 'rv-lines scroll scroll-edges', role: 'listbox', tabindex: '0' },
    pin,
    inner,
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
  // Removed and added lines that replace each other, per file and hunk, and their marks once computed
  let partners = new Map<string, Map<number, number>>()
  let marks = new Map<string, LineMarks>()

  const rowId = (index: number) => `${deps.id}-row-${index}`
  const viewHeight = () => element.clientHeight || LINE_HEIGHT * 30

  // The file a row belongs to, by its header's position
  function fileAtRow(index: number): number {
    const row = rows[index]
    return row ? row.file : 0
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
  })

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
          'aria-label': fileLabel(file, row.notice, i18n),
        },
        fileHead(file, row.notice, headDeps()),
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
    return h(
      'div',
      { ...attributes, 'data-kind': line.kind, 'aria-label': lineLabel(line) },
      gutter(line.old, line.new, sign),
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
            : '',
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
    const now = target ?? fileAtTop(element.scrollTop + 1)
    if (now !== current && files.length > 0) {
      current = now
      deps.onCurrentFile(now)
    }
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
    cursor = Math.max(0, Math.min(rows.length - 1, index))
    reveal()
  }

  function moveBy(step: number) {
    anchorCursor()
    moveTo(cursor + step)
  }

  // A file read from its header: it lands at the top with the cursor on it
  function revealFile(index: number) {
    const start = starts[index]
    if (start === undefined) return false
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
    if (!row || !file) return
    if (row.kind === 'expand') deps.expand(file, row.gap)
    else if (row.kind === 'file' && isCollapsed(row.notice)) deps.showAnyway(file)
  }

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
  element.addEventListener('click', (event) => {
    const clicked = (event.target as Element).closest<HTMLElement>('.rv-row')
    if (!clicked?.id) return
    const index = Number(clicked.id.slice(rowId(0).length - 1))
    if (!Number.isInteger(index)) return
    cursor = index
    target = fileAtRow(index)
    if (rows[cursor]?.kind === 'expand') activate()
    else draw()
  })
  element.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const { key } = event
    if (key === 'ArrowDown') moveBy(1)
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

  // Where the reading was, as a file and a distance into it, so new rows open at the same place
  function anchor() {
    if (rows.length === 0) return undefined
    const file = fileAtTop(element.scrollTop)
    const cursorFile = fileAtRow(cursor)
    return {
      path: files[file]?.path,
      offset: element.scrollTop - (tops[starts[file] ?? 0] ?? 0),
      cursorPath: files[cursorFile]?.path,
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
      files = nextFiles
      rows = nextRows
      tops = []
      starts = []
      pinned = undefined
      let height = 0
      let digits = 1
      let columns = 0
      rows.forEach((row, index) => {
        tops.push(height)
        height += heightOf(row)
        if (row.kind === 'file') starts.push(index)
        else if (row.kind === 'context') {
          digits = Math.max(digits, String(row.new).length, String(row.old).length)
          columns = Math.max(columns, columnsOf(row.text))
        } else if (row.kind === 'line') {
          const line = files[row.file]?.hunks[row.hunk]?.lines[row.line]
          if (line) {
            digits = Math.max(digits, String(line.old ?? line.new ?? 0).length)
            columns = Math.max(columns, columnsOf(line.text))
          }
        }
      })
      inner.style.height = `${height}px`
      inner.style.setProperty('--rv-digits', String(Math.max(3, digits)))
      inner.style.setProperty('--rv-cols', String(columns))
      element.setAttribute('aria-label', i18n.plural('review.a11y.changes', files.length))
      const fileOf = (path: string | undefined) => files.findIndex((file) => file.path === path)
      if (kept === undefined) {
        cursor = 0
        target = undefined
        current = -1
        scrollTo(0)
        element.scrollLeft = 0
      } else {
        const topFile = fileOf(kept.path)
        const cursorFile = fileOf(kept.cursorPath)
        const fileStart = (file: number) => tops[starts[file] ?? 0] ?? 0
        const fileEnd = (file: number) => (file + 1 < starts.length ? fileStart(file + 1) : height)
        if (topFile >= 0) {
          scrollTo(
            fileStart(topFile) + Math.min(kept.offset, fileEnd(topFile) - fileStart(topFile)),
          )
        }
        if (cursorFile >= 0) {
          const last = (starts[cursorFile + 1] ?? rows.length) - 1
          cursor = Math.min((starts[cursorFile] ?? 0) + kept.cursorOffset, last)
        } else cursor = Math.min(cursor, Math.max(0, rows.length - 1))
        if (target !== undefined && target >= starts.length) target = undefined
      }
      draw()
    },
    clear() {
      files = []
      rows = []
      tops = []
      starts = []
      pinned = undefined
      pin.hidden = true
      inner.replaceChildren()
      inner.style.height = '0'
    },
    focus: () => element.focus(),
    nextHunk: (step: 1 | -1) => stepHunk(step),
    nextFile: (step: 1 | -1) => stepFile(step),
    revealFile,
    redraw: draw,
  }
}

export type DiffView = ReturnType<typeof createDiffView>
