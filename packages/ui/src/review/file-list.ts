import {
  type DiffFile,
  type DiffModule,
  type IndexRow,
  indexRowOf,
  indexRows,
  type MessageKey,
  modulePath,
  parentModule,
  type Translator,
  visibleRange,
} from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import { moduleHead, moduleHeight, moduleLabel } from './module-row.ts'

export const FILE_ROW_HEIGHT = 28
const OVERSCAN = 6
const PAGE = 8

// The state as a letter, as in VS Code: the letter tells it as well as the color does
const LETTERS = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R', copied: 'C' } as const

export type FileState = 'added' | 'modified' | 'deleted' | 'renamed'

// The color of the letter: untracked reads as added, copied as renamed
export const fileState = (file: DiffFile): FileState =>
  file.untracked ? 'added' : file.status === 'copied' ? 'renamed' : file.status

export const statusKey = (file: DiffFile): MessageKey =>
  file.untracked ? 'review.status.untracked' : `review.status.${file.status}`

// The full name is in the row's own name for a screen reader and in the tooltip for the eye
export const fileLetter = (file: DiffFile, i18n: Translator) =>
  h(
    'span',
    {
      class: 'rv-letter',
      'data-state': fileState(file),
      'data-tip': i18n.t(statusKey(file)),
      'aria-hidden': 'true',
    },
    file.untracked ? 'U' : LETTERS[file.status],
  )

// A long path keeps its file name whole and loses the middle of its folders, with the whole path in the
// tooltip; a file of a submodule sets the submodule's folder apart in a box before the rest
export function pathLabel(path: string, full = path, module?: string): HTMLElement {
  const slash = path.lastIndexOf('/')
  const folder = slash === -1 ? '' : path.slice(0, slash + 1)
  const name = path.slice(slash + 1)
  return h(
    'span',
    { class: 'rv-path' },
    module && h('span', { class: 'rv-modpart', 'data-tip-full': full }, module),
    folder && h('span', { class: 'rv-dir', 'data-tip-full': full }, folder),
    h('span', { class: 'rv-name', 'data-tip-full': full }, name),
  )
}

// A file's whole path from the top, its submodule's folder set apart
export const filePathLabel = (file: DiffFile) =>
  file.module === undefined
    ? pathLabel(file.path)
    : pathLabel(modulePath(file), file.path, file.module)

export const counts = (added: number, removed: number) =>
  h(
    'span',
    { class: 'rv-counts' },
    h('span', { class: 'rv-plus' }, `+${added}`),
    h('span', { class: 'rv-minus' }, `−${removed}`),
  )

export interface FileListDeps {
  readonly id: string
  readonly i18n: Translator
  // The diff goes to this file
  onSelect(index: number): void
  // Enter: the diff takes the keys
  onOpen(): void
  // A click or Enter on a file listed without its content reads it
  onLoad(index: number): void
  isViewed(file: DiffFile): boolean
}

const TICK = '<path d="M6 12.5l4 4L18 8.5"/>'

type ModuleRow = Extract<IndexRow, { kind: 'module' }>

// The index of the changed files, virtualized: the repository's own files, then a group per submodule
// with a header that folds. The selected row is the file the diff is on (or the header that hides it),
// and picking one scrolls the diff to it
export function createFileList(deps: FileListDeps) {
  const { i18n } = deps
  const inner = h('div', { class: 'rv-files-inner' })
  const element = h(
    'div',
    { class: 'rv-files scroll scroll-edges', role: 'tree', tabindex: '0' },
    inner,
  )
  let files: readonly DiffFile[] = []
  let modules: readonly DiffModule[] = []
  let rows: IndexRow[] = []
  let tops: number[] = []
  let height = 0
  // The row under the cursor and the file the diff is on
  let cursor = 0
  let current = 0
  let frame = 0
  // Folded submodules, by path, kept across reads
  const collapsed = new Set<string>()

  const rowId = (index: number) => `${deps.id}-file-${index}`
  const heightOf = (row: IndexRow) =>
    row.kind === 'module' ? moduleHeight(row.module) : FILE_ROW_HEIGHT

  function layout() {
    rows = indexRows(files, modules, collapsed)
    tops = []
    height = 0
    for (const row of rows) {
      tops.push(height)
      height += heightOf(row)
    }
  }

  const place = (index: number, depth: number) =>
    `transform: translateY(${tops[index] ?? 0}px); --rv-depth: ${depth}`

  function fileRow(file: DiffFile, index: number, row: number, depth: number): HTMLElement {
    const viewed = deps.isViewed(file)
    const named = i18n.t('review.a11y.file', {
      path: file.path,
      status: i18n.t(statusKey(file)),
      added: i18n.plural('review.a11y.added', file.additions),
      removed: i18n.plural('review.a11y.removed', file.deletions),
    })
    const name = file.unloaded
      ? `${named}. ${i18n.t('review.unloaded')}. ${i18n.t('review.a11y.showAnyway')}`
      : named
    return h(
      'div',
      {
        class: viewed ? 'rv-file rv-file-viewed' : 'rv-file',
        role: 'treeitem',
        id: rowId(row),
        'aria-level': String(depth + 1),
        'aria-selected': String(row === cursor),
        'aria-label': viewed ? i18n.t('review.a11y.viewed', { file: name }) : name,
        'data-index': String(index),
        'data-depth': depth > 0 ? String(depth) : undefined,
        style: place(row, depth),
      },
      fileLetter(file, i18n),
      file.module === undefined ? pathLabel(file.path) : pathLabel(modulePath(file), file.path),
      file.unloaded &&
        h(
          'span',
          { class: 'rv-wait', 'data-tip': i18n.t('review.unloaded'), 'data-tip-key': 'Enter' },
          i18n.t('review.unloaded.short'),
        ),
      file.hunks.length === 0 ? undefined : counts(file.additions, file.deletions),
      viewed &&
        h('span', { class: 'rv-tick', 'data-tip': i18n.t('review.viewed') }, icon(TICK, 14)),
    )
  }

  function moduleRow(row: ModuleRow, index: number): HTMLElement {
    const { module, depth } = row
    const holder = parentModule(
      module.path,
      modules.map((other) => other.path),
    )
    const label = holder === undefined ? module.path : module.path.slice(holder.length + 1)
    return h(
      'div',
      {
        class: 'rv-file rv-module',
        role: 'treeitem',
        id: rowId(index),
        'aria-level': String(depth + 1),
        'aria-expanded': String(!row.collapsed),
        'aria-selected': String(index === cursor),
        'aria-label': moduleLabel(module, row.count, i18n),
        'data-module': module.path,
        'data-depth': depth > 0 ? String(depth) : undefined,
        style: `${place(index, depth)}; height: ${heightOf(row) - 1}px`,
      },
      ...moduleHead(module, label, row.count, i18n),
    )
  }

  function draw() {
    inner.style.height = `${height}px`
    const { start, end } = visibleRange({
      tops,
      scrollTop: element.scrollTop,
      viewportHeight: element.clientHeight || FILE_ROW_HEIGHT * 10,
      overscan: OVERSCAN,
    })
    const drawn: HTMLElement[] = []
    for (let index = start; index < end; index++) {
      const row = rows[index]
      const file = row?.kind === 'file' ? files[row.file] : undefined
      if (row?.kind === 'module') drawn.push(moduleRow(row, index))
      else if (row && file) drawn.push(fileRow(file, row.file, index, row.depth))
    }
    inner.replaceChildren(...drawn)
    if (rows.length > 0) element.setAttribute('aria-activedescendant', rowId(cursor))
    else element.removeAttribute('aria-activedescendant')
  }

  function reveal() {
    const row = rows[cursor]
    const top = tops[cursor] ?? 0
    const bottom = top + (row ? heightOf(row) : FILE_ROW_HEIGHT)
    const view = element.clientHeight || FILE_ROW_HEIGHT * 10
    if (top < element.scrollTop) element.scrollTop = top
    else if (bottom > element.scrollTop + view) element.scrollTop = bottom - view
    draw()
  }

  // The file a row takes the diff to: its own, or the first of a submodule's
  const fileOfRow = (row: IndexRow | undefined) =>
    row?.kind === 'file' ? row.file : row?.kind === 'module' ? row.first : undefined

  // The cursor moves along the rows; a row that names a file takes the diff there
  function moveTo(index: number) {
    if (rows.length === 0) return
    cursor = Math.max(0, Math.min(rows.length - 1, index))
    reveal()
    const file = fileOfRow(rows[cursor])
    if (file !== undefined && file !== current) {
      current = file
      deps.onSelect(file)
    }
  }

  // The cursor goes to the row standing for the file the diff is on, after a fold or a new read
  function follow() {
    const row = indexRowOf(rows, files, current)
    cursor = row >= 0 ? row : Math.min(cursor, Math.max(0, rows.length - 1))
  }

  const headerOf = (path: string) =>
    rows.findIndex((row) => row.kind === 'module' && row.module.path === path)

  function toggle(path: string) {
    if (collapsed.has(path)) collapsed.delete(path)
    else collapsed.add(path)
    layout()
    const header = headerOf(path)
    if (header >= 0) cursor = header
    reveal()
  }

  // ← folds a submodule or goes up to the header that holds the row; → opens it or goes to its first row
  function sideways(step: 1 | -1) {
    const row = rows[cursor]
    if (!row) return
    if (row.kind === 'module' && (step === 1) === row.collapsed) return toggle(row.module.path)
    if (step === 1) {
      if (row.kind === 'module') moveTo(cursor + 1)
      return
    }
    for (let index = cursor - 1; index >= 0; index--) {
      const above = rows[index]
      if (above?.kind === 'module' && above.depth < row.depth) return moveTo(index)
    }
  }

  function activate() {
    const row = rows[cursor]
    if (row?.kind === 'module') toggle(row.module.path)
    else if (row?.kind === 'file' && files[row.file]?.unloaded) deps.onLoad(row.file)
    else deps.onOpen()
  }

  element.addEventListener(
    'scroll',
    () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        draw()
      })
    },
    { passive: true },
  )
  element.addEventListener('click', (event) => {
    const target = (event.target as Element).closest<HTMLElement>('.rv-file')
    if (!target?.id) return
    const index = Number(target.id.slice(rowId(0).length - 1))
    const row = rows[index]
    if (!row) return
    moveTo(index)
    if (row.kind === 'module') toggle(row.module.path)
    else if (files[row.file]?.unloaded) deps.onLoad(row.file)
  })
  element.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const { key } = event
    if (key === 'ArrowDown') moveTo(cursor + 1)
    else if (key === 'ArrowUp') moveTo(cursor - 1)
    else if (key === 'ArrowRight') sideways(1)
    else if (key === 'ArrowLeft') sideways(-1)
    else if (key === 'PageDown') moveTo(cursor + PAGE)
    else if (key === 'PageUp') moveTo(cursor - PAGE)
    else if (key === 'Home') moveTo(0)
    else if (key === 'End') moveTo(rows.length - 1)
    else if (key === 'Enter' || (key === ' ' && rows[cursor]?.kind === 'module')) activate()
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  return {
    element,
    show(next: readonly DiffFile[], nextModules: readonly DiffModule[], index: number) {
      files = next
      modules = nextModules
      current = Math.max(0, Math.min(index, next.length - 1))
      element.setAttribute('aria-label', i18n.t('review.a11y.files'))
      layout()
      follow()
      reveal()
    },
    // `[` and `]` from the index: the next or previous file, wherever it sits
    select(index: number) {
      if (files.length === 0) return
      current = Math.max(0, Math.min(files.length - 1, index))
      follow()
      reveal()
      deps.onSelect(current)
    },
    // The file the diff is on, without moving the diff
    highlight(index: number) {
      if (index < 0 || index >= files.length || index === current) return
      current = index
      follow()
      reveal()
    },
    // A submodule's group, opened with those that hold it, the cursor on its header and the diff on its
    // first file; false when the change has no such submodule
    showModule(path: string): boolean {
      for (const module of modules) {
        if (path === module.path || path.startsWith(`${module.path}/`))
          collapsed.delete(module.path)
      }
      layout()
      const header = headerOf(path)
      if (header < 0) return false
      cursor = header
      // The header goes to the top, so its files show under it
      element.scrollTop = tops[header] ?? 0
      draw()
      const first = fileOfRow(rows[header])
      if (first !== undefined) {
        current = first
        deps.onSelect(first)
      }
      return true
    },
    // The file the diff is on
    selected: () => current,
    // The file under the cursor, none on a submodule's header
    selectedFile(): number | undefined {
      const row = rows[cursor]
      return row?.kind === 'file' ? row.file : undefined
    },
    focus: () => element.focus(),
    redraw: draw,
  }
}
