import {
  changedPairs,
  type DiffFile,
  type DiffGap,
  type DiffLine,
  type DiffRow,
  gapSize,
  type Translator,
  visibleRange,
} from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import { type LineMarks, type Mark, wordMarks } from './word-marks.ts'

export const LINE_HEIGHT = 20
export const HUNK_HEIGHT = 26
const OVERSCAN = 12
const PAGE = 20
const TAB_COLUMNS = 4
const UNFOLD = '<path d="M12 3v6M9 6l3 3 3-3M12 21v-6M9 18l3-3 3 3M5 12h14"/>'

// A drawn row: the core's rows, with a collapsed gap above a hunk shown as its own row
type ViewRow =
  | { readonly kind: 'expand'; readonly gap: DiffGap }
  | Exclude<DiffRow, { kind: 'end' }>

export interface DiffViewDeps {
  readonly id: string
  readonly i18n: Translator
  expand(gap: DiffGap): void
}

function viewRows(rows: readonly DiffRow[]): ViewRow[] {
  const out: ViewRow[] = []
  for (const row of rows) {
    if (row.kind === 'end') out.push({ kind: 'expand', gap: row.gap })
    else if (row.kind === 'hunk' && row.gap) out.push({ kind: 'expand', gap: row.gap }, row)
    else out.push(row)
  }
  return out
}

const heightOf = (row: ViewRow) => (row.kind === 'hunk' ? HUNK_HEIGHT : LINE_HEIGHT)

const columnsOf = (text: string) => {
  let tabs = 0
  for (const char of text) if (char === '\t') tabs += 1
  return text.length + tabs * (TAB_COLUMNS - 1)
}

// The lines of one file, virtualized: only the rows in view exist, so 10 000 lines scroll like 50.
// A cursor row follows the keys and is what a screen reader reads
export function createDiffView(deps: DiffViewDeps) {
  const { i18n } = deps
  const t = i18n.t
  const inner = h('div', { class: 'rv-inner' })
  const element = h(
    'div',
    {
      class: 'rv-lines scroll scroll-edges',
      role: 'listbox',
      tabindex: '0',
    },
    inner,
  )
  let file: DiffFile | undefined
  let rows: ViewRow[] = []
  let tops: number[] = []
  let height = 0
  let cursor = 0
  let frame = 0
  // Removed and added lines that replace each other, per hunk, and their marks once computed
  let partners = new Map<number, Map<number, number>>()
  let marks = new Map<string, LineMarks>()

  const rowId = (index: number) => `${deps.id}-row-${index}`

  function partnerOf(hunk: number, line: number): number | undefined {
    let known = partners.get(hunk)
    if (known === undefined) {
      known = new Map()
      const lines = file?.hunks[hunk]
      if (lines)
        for (const [removed, added] of changedPairs(lines)) {
          known.set(removed, added)
          known.set(added, removed)
        }
      partners.set(hunk, known)
    }
    return known.get(line)
  }

  function marksOf(hunk: number, index: number, line: DiffLine): readonly Mark[] {
    const partner = partnerOf(hunk, index)
    const other = partner === undefined ? undefined : file?.hunks[hunk]?.lines[partner]
    if (partner === undefined || other === undefined) return []
    const removedIndex = line.kind === 'remove' ? index : partner
    const key = `${hunk}:${removedIndex}`
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

  function lineLabel(line: DiffLine): string {
    const text = line.text.trim() || ' '
    if (line.kind === 'add') return t('review.a11y.added', { line: line.new ?? 0, text })
    if (line.kind === 'remove') return t('review.a11y.removed', { line: line.old ?? 0, text })
    return t('review.a11y.context', { line: line.new ?? 0, text })
  }

  function drawRow(row: ViewRow, index: number): HTMLElement {
    const attributes = {
      class: 'rv-row',
      role: 'option',
      id: rowId(index),
      'aria-selected': String(index === cursor),
      style: `transform: translateY(${tops[index] ?? 0}px)`,
    }
    if (row.kind === 'expand') {
      const label = i18n.plural('review.showLines', gapSize(row.gap))
      const element = h(
        'div',
        {
          ...attributes,
          class: 'rv-row rv-expand',
          'data-gap': String(row.gap.id),
          'aria-label': label,
        },
        h('span', { class: 'rv-fold' }, icon(UNFOLD, 14)),
        h('span', { class: 'rv-expand-text' }, label),
      )
      return element
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
        h('span', { class: 'rv-fold' }),
        h(
          'span',
          { class: 'rv-code' },
          header,
          section && h('span', { class: 'rv-section' }, ` ${section}`),
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
        number(row.old),
        number(row.new),
        h('span', { class: 'rv-sign' }),
        code(row.text, []),
      )
    }
    const line = file?.hunks[row.hunk]?.lines[row.line]
    if (line === undefined) return h('div', attributes)
    const sign = line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ''
    return h(
      'div',
      { ...attributes, 'data-kind': line.kind, 'aria-label': lineLabel(line) },
      number(line.old),
      number(line.new),
      h('span', { class: 'rv-sign', 'aria-hidden': 'true' }, sign),
      code(line.text, line.kind === 'context' ? [] : marksOf(row.hunk, row.line, line)),
    )
  }

  function draw() {
    const { start, end } = visibleRange({
      tops,
      scrollTop: element.scrollTop,
      viewportHeight: element.clientHeight || LINE_HEIGHT * 30,
      overscan: OVERSCAN,
    })
    const drawn: HTMLElement[] = []
    for (let index = start; index < end; index++) {
      const row = rows[index]
      if (row) drawn.push(drawRow(row, index))
    }
    inner.replaceChildren(...drawn)
    if (rows.length > 0) element.setAttribute('aria-activedescendant', rowId(cursor))
    else element.removeAttribute('aria-activedescendant')
  }

  function schedule() {
    if (frame !== 0) return
    frame = requestAnimationFrame(() => {
      frame = 0
      draw()
    })
  }

  function reveal() {
    const top = tops[cursor] ?? 0
    const row = rows[cursor]
    const bottom = top + (row ? heightOf(row) : LINE_HEIGHT)
    const view = element.clientHeight || LINE_HEIGHT * 30
    if (top < element.scrollTop) element.scrollTop = top
    else if (bottom > element.scrollTop + view) element.scrollTop = bottom - view
    draw()
  }

  function moveTo(index: number) {
    if (rows.length === 0) return
    cursor = Math.max(0, Math.min(rows.length - 1, index))
    reveal()
  }

  // The next or previous hunk header from the cursor; the expand row above a hunk leads to it
  function stepHunk(step: 1 | -1) {
    for (let index = cursor + step; index >= 0 && index < rows.length; index += step) {
      if (rows[index]?.kind === 'hunk') {
        moveTo(index)
        // A hunk is read from its header down, so it lands at the top
        element.scrollTop = Math.max(0, (tops[index] ?? 0) - LINE_HEIGHT)
        draw()
        return true
      }
    }
    return false
  }

  function activate() {
    const row = rows[cursor]
    if (row?.kind === 'expand') deps.expand(row.gap)
  }

  element.addEventListener('scroll', schedule, { passive: true })
  element.addEventListener('click', (event) => {
    const target = (event.target as Element).closest<HTMLElement>('.rv-row')
    if (!target?.id) return
    const index = Number(target.id.slice(rowId(0).length - 1))
    if (Number.isInteger(index)) cursor = index
    if (rows[cursor]?.kind === 'expand') activate()
    else draw()
  })
  element.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const { key } = event
    if (key === 'ArrowDown') moveTo(cursor + 1)
    else if (key === 'ArrowUp') moveTo(cursor - 1)
    else if (key === 'PageDown') moveTo(cursor + PAGE)
    else if (key === 'PageUp') moveTo(cursor - PAGE)
    else if (key === 'Home') moveTo(0)
    else if (key === 'End') moveTo(rows.length - 1)
    else if (key === 'Enter' || key === ' ') activate()
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  return {
    element,
    // Draws a file's rows; the same file keeps its scroll and cursor, another one starts at the top
    show(next: DiffFile, nextRows: readonly DiffRow[], label: string) {
      const same = file?.path === next.path
      if (!same || file !== next) {
        partners = new Map()
        marks = new Map()
      }
      file = next
      rows = viewRows(nextRows)
      tops = []
      height = 0
      let digits = 1
      let columns = 0
      for (const row of rows) {
        tops.push(height)
        height += heightOf(row)
        if (row.kind === 'context') {
          digits = Math.max(digits, String(row.new).length, String(row.old).length)
          columns = Math.max(columns, columnsOf(row.text))
        } else if (row.kind === 'line') {
          const line = next.hunks[row.hunk]?.lines[row.line]
          if (line) {
            digits = Math.max(digits, String(line.old ?? line.new ?? 0).length)
            columns = Math.max(columns, columnsOf(line.text))
          }
        }
      }
      if (!same) {
        cursor = 0
        element.scrollTop = 0
        element.scrollLeft = 0
      } else cursor = Math.min(cursor, Math.max(0, rows.length - 1))
      inner.style.height = `${height}px`
      inner.style.setProperty('--rv-digits', String(Math.max(3, digits)))
      inner.style.setProperty('--rv-cols', String(columns))
      element.setAttribute('aria-label', label)
      draw()
    },
    clear() {
      file = undefined
      rows = []
      tops = []
      inner.replaceChildren()
      inner.style.height = '0'
    },
    focus: () => element.focus(),
    nextHunk: (step: 1 | -1) => stepHunk(step),
    // The first hunk in view, so a file opens on what changed
    revealFirstHunk() {
      const first = rows.findIndex((row) => row.kind === 'hunk')
      if (first > 0) cursor = first
      draw()
    },
    redraw: draw,
  }
}
