import { type DiffFile, type FileNotice, isCollapsed, type Translator } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import { counts, fileLetter, filePathLabel, statusKey } from './file-list.ts'

export function sizeText(i18n: Translator, bytes: number): string {
  if (bytes < 1024) return i18n.t('review.size.b', { value: bytes })
  if (bytes < 1024 * 1024)
    return i18n.t('review.size.kb', { value: (bytes / 1024).toFixed(1).replace(/\.0$/, '') })
  return i18n.t('review.size.mb', { value: (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '') })
}

export interface FileHeadDeps {
  readonly i18n: Translator
  // The modifier's name and whether it was held, for Ctrl+click on the path (Cmd on macOS)
  readonly modifier: string
  isModified(event: MouseEvent): boolean
  open(path: string): void
  showAnyway(file: DiffFile): void
  // Reads the content of a file listed without it
  load(file: DiffFile): void
  // Whether the file is marked viewed, and whether a mark went away because the file changed again
  viewed(file: DiffFile): { readonly viewed: boolean; readonly changed: boolean }
  toggleViewed(file: DiffFile): void
  // How many comments are pending on the file, told in its header even when it is folded
  commentCount(file: DiffFile): number
}

const BOX = '<rect x="4" y="4" width="16" height="16" rx="3"/>'
const TICK = '<path d="M8 12.5l2.7 2.7L16 9.6"/>'

// What the file is beyond its lines: where it came from, its mode, its line endings, who wrote it
function labels(file: DiffFile, i18n: Translator): string[] {
  const { t } = i18n
  const out: string[] = []
  if (file.oldPath !== undefined)
    out.push(
      t(file.status === 'copied' ? 'review.copiedFrom' : 'review.renamedFrom', {
        path: file.oldPath,
      }),
    )
  if (file.oldMode !== undefined && file.newMode !== undefined)
    out.push(t('review.mode', { old: file.oldMode, new: file.newMode }))
  if (file.submodule) out.push(t('review.submodule'))
  if (file.crlf) out.push(t('review.crlf'))
  if (file.generated) out.push(t('review.generated'))
  return out
}

// Why a file shows no lines, as a sentence
export function noticeText(
  file: DiffFile,
  notice: FileNotice | undefined,
  i18n: Translator,
): string | undefined {
  const { t } = i18n
  if (notice === 'omitted') return t('review.omitted', { size: sizeText(i18n, file.size ?? 0) })
  if (notice === 'non-utf8') return t('review.nonUtf8')
  if (notice === 'binary') {
    return file.size === undefined
      ? t('review.binary')
      : t('review.binarySize', { size: sizeText(i18n, file.size) })
  }
  if (notice === 'generated') return t('review.collapsed.generated')
  if (notice === 'large')
    return t('review.collapsed.large', { count: file.additions + file.deletions })
  if (notice === 'no-content') return t('review.noContent')
  if (notice === 'unloaded') return t('review.unloaded')
  return undefined
}

// How a screen reader names a file: path, state, counts, viewed, and why it shows no lines
export function fileLabel(
  file: DiffFile,
  notice: FileNotice | undefined,
  i18n: Translator,
  viewed = false,
) {
  const named = i18n.t('review.a11y.file', {
    path: file.path,
    status: i18n.t(statusKey(file)),
    added: i18n.plural('review.a11y.added', file.additions),
    removed: i18n.plural('review.a11y.removed', file.deletions),
  })
  const name = viewed ? i18n.t('review.a11y.viewed', { file: named }) : named
  const why = noticeText(file, notice, i18n)
  if (why === undefined) return name
  return isCollapsed(notice) || notice === 'unloaded'
    ? `${name}. ${why} ${i18n.t('review.a11y.showAnyway')}`
    : `${name}. ${why}`
}

// "Viewed", as on GitHub: a checkbox the mouse ticks and `v` toggles from the diff
function viewedBox(file: DiffFile, deps: FileHeadDeps): HTMLElement {
  const { viewed } = deps.viewed(file)
  const box = h(
    'button',
    {
      type: 'button',
      class: 'rv-viewed',
      role: 'checkbox',
      'aria-checked': String(viewed),
      tabindex: '-1',
      'data-tip': deps.i18n.t('review.viewed'),
      'data-tip-key': 'v',
    },
    icon(viewed ? BOX + TICK : BOX, 15),
    h('span', {}, deps.i18n.t('review.viewed')),
  )
  box.addEventListener('mousedown', (event) => event.preventDefault())
  box.addEventListener('click', (event) => {
    event.stopPropagation()
    deps.toggleViewed(file)
  })
  return box
}

// A file's header in the diff: state glyph, path (Ctrl+click opens it), labels, why it shows no lines,
// "Load diff" for a collapsed one or one whose content waits, "Viewed" and the counts. Its buttons never take the focus from the
// diff
export function fileHead(
  file: DiffFile,
  notice: FileNotice | undefined,
  deps: FileHeadDeps,
): HTMLElement {
  const { i18n } = deps
  const letter = fileLetter(file, i18n)
  const path = filePathLabel(file)
  path.classList.add('rv-open')
  path.dataset.tip = file.path
  path.dataset.tipKey = i18n.t('terminal.openPath', { modifier: deps.modifier })
  path.addEventListener('click', (event) => {
    if (deps.isModified(event)) deps.open(file.path)
  })
  let action: HTMLElement | undefined
  if (isCollapsed(notice) || notice === 'unloaded') {
    action = h(
      'button',
      { type: 'button', class: 'vbtn rv-show', tabindex: '-1' },
      i18n.t('review.showAnyway'),
    )
    action.addEventListener('mousedown', (event) => event.preventDefault())
    action.addEventListener('click', (event) => {
      event.stopPropagation()
      if (notice === 'unloaded') deps.load(file)
      else deps.showAnyway(file)
    })
  }
  const unreadable = isCollapsed(notice) ? undefined : noticeText(file, notice, i18n)
  const changed = deps.viewed(file).changed
  const comments = deps.commentCount(file)
  return h(
    'div',
    { class: 'rv-band rv-fhead' },
    letter,
    path,
    ...labels(file, i18n).map((text) => h('span', { class: 'rv-label' }, text)),
    changed && h('span', { class: 'rv-label rv-changed' }, i18n.t('review.changedSinceViewed')),
    comments > 0 && h('span', { class: 'rv-label' }, i18n.plural('review.comments', comments)),
    unreadable && h('span', { class: 'rv-why' }, unreadable),
    h('span', { class: 'rv-spacer' }),
    action,
    file.hunks.length === 0 ? undefined : counts(file.additions, file.deletions),
    viewedBox(file, deps),
  )
}
