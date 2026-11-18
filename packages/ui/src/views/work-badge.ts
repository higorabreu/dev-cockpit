import type { Translator } from '@dck/core'
import type { RailBadge } from '../kit/badge.ts'

// What the Work badge adds up, by the role the connectors gave their views
export interface WorkCounts {
  readonly review: number
  readonly attention: number
}

export const NO_WORK: WorkCounts = { review: 0, attention: 0 }

export function workBadge(i18n: Translator, counts: WorkCounts): RailBadge | undefined {
  const parts = [
    counts.review > 0 ? i18n.plural('views.badge.review', counts.review) : undefined,
    counts.attention > 0 ? i18n.plural('views.badge.attention', counts.attention) : undefined,
  ].filter((part) => part !== undefined)
  const [first, second] = parts
  if (first === undefined) return undefined
  return {
    count: counts.review + counts.attention,
    detail: second === undefined ? first : i18n.t('rail.badge.both', { first, second }),
  }
}
