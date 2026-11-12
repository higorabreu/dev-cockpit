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

// The mark the "All tabs" button shows for tabs out of view: needs you outranks finished
export function strongestMark(kinds: Iterable<AttentionKind>): AttentionKind | undefined {
  let strongest: AttentionKind | undefined
  for (const kind of kinds) {
    if (kind === 'needs-you') return kind
    strongest = kind
  }
  return strongest
}
