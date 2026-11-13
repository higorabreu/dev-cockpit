import { type DiffFile, type FileNotice, isCollapsed, type Translator } from '@dck/core'
import { h } from '../panel/dom.ts'
import { counts, fileGlyph, pathLabel, statusKey } from './file-list.ts'

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
}

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
  return undefined
}

// How a screen reader names a file: path, state, counts, and why it shows no lines
export function fileLabel(file: DiffFile, notice: FileNotice | undefined, i18n: Translator) {
  const name = i18n.t('review.a11y.file', {
    path: file.path,
    status: i18n.t(statusKey(file)),
    added: file.additions,
    removed: file.deletions,
  })
  const why = noticeText(file, notice, i18n)
  if (why === undefined) return name
  return isCollapsed(notice)
    ? `${name}. ${why} ${i18n.t('review.a11y.showAnyway')}`
    : `${name}. ${why}`
}

// A file's header in the diff: state glyph, path (Ctrl+click opens it), labels, why it shows no lines,
// "Show anyway" for a collapsed one, and the counts. Its button never takes the focus from the diff
export function fileHead(
  file: DiffFile,
  notice: FileNotice | undefined,
  deps: FileHeadDeps,
): HTMLElement {
  const { i18n } = deps
  const glyph = fileGlyph(file)
  glyph.dataset.tip = i18n.t(statusKey(file))
  const path = pathLabel(file.path)
  path.classList.add('rv-open')
  path.dataset.tip = file.path
  path.dataset.tipKey = i18n.t('terminal.openPath', { modifier: deps.modifier })
  path.addEventListener('click', (event) => {
    if (deps.isModified(event)) deps.open(file.path)
  })
  let action: HTMLElement | undefined
  if (isCollapsed(notice)) {
    action = h(
      'button',
      { type: 'button', class: 'vbtn rv-show', tabindex: '-1' },
      i18n.t('review.showAnyway'),
    )
    action.addEventListener('mousedown', (event) => event.preventDefault())
    action.addEventListener('click', (event) => {
      event.stopPropagation()
      deps.showAnyway(file)
    })
  }
  const unreadable = isCollapsed(notice) ? undefined : noticeText(file, notice, i18n)
  return h(
    'div',
    { class: 'rv-band rv-fhead' },
    glyph,
    path,
    ...labels(file, i18n).map((text) => h('span', { class: 'rv-label' }, text)),
    unreadable && h('span', { class: 'rv-why' }, unreadable),
    h('span', { class: 'rv-spacer' }),
    action,
    file.hunks.length === 0 ? undefined : counts(file.additions, file.deletions),
  )
}
