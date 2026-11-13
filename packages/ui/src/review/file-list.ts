import { type DiffFile, type MessageKey, type Translator, visibleRange } from '@dck/core'
import { h, icon } from '../panel/dom.ts'

export const FILE_ROW_HEIGHT = 28
const OVERSCAN = 6
const PAGE = 8

// The shape tells the state as well as the color, like the file tree of a merge request
const GLYPHS = {
  added: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>',
  deleted: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12h7"/>',
  modified:
    '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  renamed: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12h7M12.5 9l3 3-3 3"/>',
} as const

export type FileState = keyof typeof GLYPHS

export const fileState = (file: DiffFile): FileState =>
  file.status === 'copied' ? 'renamed' : file.status

export const statusKey = (file: DiffFile): MessageKey =>
  file.untracked ? 'review.status.untracked' : `review.status.${file.status}`

export const fileGlyph = (file: DiffFile, size = 15) => {
  const state = fileState(file)
  return h('span', { class: 'rv-glyph', 'data-state': state }, icon(GLYPHS[state], size))
}

// A long path keeps its file name whole and loses the middle of its folders, with the whole path in the tooltip
export function pathLabel(path: string): HTMLElement {
  const slash = path.lastIndexOf('/')
  const folder = slash === -1 ? '' : path.slice(0, slash + 1)
  const name = path.slice(slash + 1)
  return h(
    'span',
    { class: 'rv-path' },
    folder && h('span', { class: 'rv-dir', 'data-tip-full': path }, folder),
    h('span', { class: 'rv-name', 'data-tip-full': path }, name),
  )
}

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
  onSelect(index: number): void
  // Enter: the diff takes the keys
  onOpen(): void
}

// The changed files, virtualized; the focus stays on the list and the selected row follows the keys
export function createFileList(deps: FileListDeps) {
  const { i18n } = deps
  const inner = h('div', { class: 'rv-files-inner' })
  const element = h(
    'div',
    { class: 'rv-files scroll scroll-edges', role: 'listbox', tabindex: '0' },
    inner,
  )
  let files: readonly DiffFile[] = []
  let selected = 0
  let frame = 0

  const rowId = (index: number) => `${deps.id}-file-${index}`

  function row(file: DiffFile, index: number): HTMLElement {
    const status = i18n.t(statusKey(file))
    const element = h(
      'div',
      {
        class: 'rv-file',
        role: 'option',
        id: rowId(index),
        'aria-selected': String(index === selected),
        'aria-posinset': String(index + 1),
        'aria-setsize': String(files.length),
        'aria-label': i18n.t('review.a11y.file', {
          path: file.path,
          status,
          added: file.additions,
          removed: file.deletions,
        }),
        'data-index': String(index),
        style: `transform: translateY(${index * FILE_ROW_HEIGHT}px)`,
      },
      fileGlyph(file),
      pathLabel(file.path),
      file.hunks.length === 0 ? undefined : counts(file.additions, file.deletions),
    )
    return element
  }

  function draw() {
    inner.style.height = `${files.length * FILE_ROW_HEIGHT}px`
    const tops = files.map((_file, index) => index * FILE_ROW_HEIGHT)
    const { start, end } = visibleRange({
      tops,
      scrollTop: element.scrollTop,
      viewportHeight: element.clientHeight || FILE_ROW_HEIGHT * 10,
      overscan: OVERSCAN,
    })
    const drawn: HTMLElement[] = []
    for (let index = start; index < end; index++) {
      const file = files[index]
      if (file) drawn.push(row(file, index))
    }
    inner.replaceChildren(...drawn)
    if (files.length > 0) element.setAttribute('aria-activedescendant', rowId(selected))
    else element.removeAttribute('aria-activedescendant')
  }

  function reveal() {
    const top = selected * FILE_ROW_HEIGHT
    const view = element.clientHeight || FILE_ROW_HEIGHT * 10
    if (top < element.scrollTop) element.scrollTop = top
    else if (top + FILE_ROW_HEIGHT > element.scrollTop + view)
      element.scrollTop = top + FILE_ROW_HEIGHT - view
    draw()
  }

  function select(index: number) {
    if (files.length === 0) return
    const next = Math.max(0, Math.min(files.length - 1, index))
    if (next === selected) return reveal()
    selected = next
    reveal()
    deps.onSelect(selected)
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
    const target = (event.target as Element).closest<HTMLElement>('[data-index]')
    if (!target) return
    select(Number(target.dataset.index))
  })
  element.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const { key } = event
    if (key === 'ArrowDown') select(selected + 1)
    else if (key === 'ArrowUp') select(selected - 1)
    else if (key === 'PageDown') select(selected + PAGE)
    else if (key === 'PageUp') select(selected - PAGE)
    else if (key === 'Home') select(0)
    else if (key === 'End') select(files.length - 1)
    else if (key === 'Enter') deps.onOpen()
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  return {
    element,
    show(next: readonly DiffFile[], index: number) {
      files = next
      selected = Math.max(0, Math.min(index, next.length - 1))
      element.setAttribute('aria-label', i18n.t('review.a11y.files'))
      reveal()
    },
    select,
    selected: () => selected,
    focus: () => element.focus(),
    redraw: draw,
  }
}
