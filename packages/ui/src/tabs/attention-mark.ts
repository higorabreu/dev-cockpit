import type { AttentionKind, Translate } from '@dck/core'

export interface AttentionMark {
  readonly className: string
  readonly label: string
}

// Shape and color together: a dot when something finished, a warning diamond when an agent needs the user
export function attentionMark(kind: AttentionKind, t: Translate): AttentionMark {
  return kind === 'needs-you'
    ? { className: 'pip needs-you', label: t('tabs.needsYou') }
    : { className: 'pip', label: t('tabs.finished') }
}

export const REVIEW_KEY = 'Ctrl+Shift+D'

// A review open behind a narrow tab's terminal: a quiet split glyph in the muted color, not an attention mark
export function reviewMark(t: Translate): AttentionMark {
  return { className: 'pip review', label: t('tabs.reviewOpen') }
}

// The mark the "All tabs" button shows for tabs out of view: needs you outranks finished
export function strongestMark(kinds: Iterable<AttentionKind>): AttentionKind | undefined {
  let strongest: AttentionKind | undefined
  for (const kind of kinds) {
    if (kind === 'needs-you') return kind
    strongest = kind
  }
  return strongest
}
