import type { ErrorCode } from '../errors.ts'
import type { MergeRequestSummary, MergeRequestView } from './code-review.ts'

export type ViewState = 'unconfigured' | 'idle' | 'refreshing' | 'error'

export interface ViewSnapshot {
  readonly view: MergeRequestView
  readonly items: readonly MergeRequestSummary[]
  // When the items were fetched from the server; undefined if never
  readonly updatedAt: number | undefined
  readonly state: ViewState
  readonly error: ErrorCode | undefined
}

export interface CachedView {
  readonly items: readonly MergeRequestSummary[]
  readonly updatedAt: number
}

// `scope` identifies the account (the address): one account's data never shows up in another
export interface ViewCacheData {
  readonly scope: string
  readonly views: Readonly<Partial<Record<MergeRequestView, CachedView>>>
}

export interface ViewCache {
  load(): Promise<ViewCacheData | undefined>
  save(data: ViewCacheData): Promise<void>
}
