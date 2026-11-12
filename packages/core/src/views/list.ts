import type { MergeRequestSummary } from '../ports/code-review.ts'
import { searchItems } from '../search/fuzzy.ts'

// Pendência é o que o autor precisa resolver: pipeline falho, conflito ou discussão aberta
export const hasPending = (item: MergeRequestSummary): boolean =>
  item.pipeline === 'failed' || item.hasConflicts || item.openDiscussions

const searchText = (item: MergeRequestSummary) =>
  `${item.title} ${item.project} !${item.number} ${item.author} ${item.sourceBranch}`

export function filterMergeRequests(
  items: readonly MergeRequestSummary[],
  query: string,
  onlyPending: boolean,
): readonly MergeRequestSummary[] {
  const base = onlyPending ? items.filter(hasPending) : items
  return searchItems(base, query, searchText)
}

export interface RangeInput {
  readonly scrollTop: number
  readonly viewportHeight: number
  readonly rowHeight: number
  readonly count: number
  // Linhas extras fora da janela, para a rolagem rápida não mostrar vazio
  readonly overscan: number
}

// Faixa de linhas a desenhar [start, end); com 1000 itens só algumas dezenas existem no DOM
export function visibleRange(input: RangeInput): { start: number; end: number } {
  const { scrollTop, viewportHeight, rowHeight, count, overscan } = input
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const last = Math.ceil((Math.max(0, scrollTop) + viewportHeight) / rowHeight)
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + overscan) }
}
