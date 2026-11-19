import type { Translate } from '@dck/core'
import type { FileAppendix } from '../files/file-tabs.ts'
import { h, icon } from '../panel/dom.ts'

export const FILE_GLYPH =
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'

const MARK_LABELS = {
  unsaved: 'files.unsaved',
  conflict: 'files.conflict',
  deleted: 'files.deletedMark',
} as const

// Shape tells them apart, as on the tab's own marks: a hollow ring for edits not saved yet (every time,
// even for the second auto save waits), a filled dot in the warning color for a conflict with the disk or
// a file deleted on disk, which the tooltip names
export function fileMark(appendix: FileAppendix, t: Translate): HTMLElement | undefined {
  if (!appendix.mark) return undefined
  const label = t(MARK_LABELS[appendix.mark])
  return h('span', {
    class: `file-mark ${appendix.mark === 'unsaved' ? 'unsaved' : 'conflict'}`,
    role: 'img',
    'aria-label': label,
    'data-tip': label,
  })
}

// An inactive tab with a file: the glyph alone beside the name, and its mark
export function fileGlyph(appendix: FileAppendix, t: Translate): HTMLElement {
  return h(
    'span',
    {
      class: 'tab-file-glyph',
      role: 'img',
      'aria-label': appendix.name,
      'data-tip': appendix.name,
    },
    icon(FILE_GLYPH, 12),
    fileMark(appendix, t),
  )
}

// The active tab's second segment: the glyph, the name (shrinking with an ellipsis, then hidden in a
// narrow window) and the mark; the whole path and the toggle key in its tooltip
export function fileSegment(appendix: FileAppendix, t: Translate, active: boolean): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: 'tab-part tab-file',
      role: 'tab',
      'aria-selected': String(active && appendix.shown),
      'aria-label': appendix.name,
      'data-tip': appendix.path,
      'data-tip-shortcut': 'toggleFile',
    },
    icon(FILE_GLYPH, 12),
    h('span', { class: 'tab-file-name' }, appendix.name),
    fileMark(appendix, t),
  )
}
