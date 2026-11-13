import { collapseReason, type DiffFile, type Translator } from '@dck/core'
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

// The selected file above its diff: state glyph, path (Ctrl+click opens it), labels and counts
export function fileHead(file: DiffFile, deps: FileHeadDeps): HTMLElement {
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
  return h(
    'div',
    { class: 'rv-head-file' },
    glyph,
    path,
    ...labels(file, i18n).map((text) => h('span', { class: 'rv-label' }, text)),
    file.hunks.length === 0 ? undefined : counts(file.additions, file.deletions),
  )
}

// Why a file shows no lines, and the way to show them when it is only collapsed
export function fileNotice(
  file: DiffFile,
  shownAnyway: boolean,
  i18n: Translator,
  showAnyway: () => void,
): HTMLElement | undefined {
  const { t } = i18n
  const notice = (...children: (Node | string | undefined)[]) =>
    h('div', { class: 'rv-notice' }, ...children)
  if (file.omitted) return notice(t('review.omitted', { size: sizeText(i18n, file.size ?? 0) }))
  if (file.nonUtf8) return notice(t('review.nonUtf8'))
  if (file.binary) {
    return notice(
      file.size === undefined
        ? t('review.binary')
        : t('review.binarySize', { size: sizeText(i18n, file.size) }),
    )
  }
  const reason = collapseReason(file)
  if (reason !== undefined && !shownAnyway) {
    const button = h('button', { type: 'button', class: 'vbtn' }, t('review.showAnyway'))
    button.addEventListener('click', showAnyway)
    return notice(
      reason === 'generated'
        ? t('review.collapsed.generated')
        : t('review.collapsed.large', { count: file.additions + file.deletions }),
      button,
    )
  }
  if (file.hunks.length === 0) return notice(t('review.noContent'))
  return undefined
}
