import type { ErrorCode } from '../errors.ts'
import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'
import type { MergeRequestSummary } from './code-review.ts'

export type IssueStatusCategory = 'todo' | 'progress'

// An issue assigned to the user in a tracker, with only what helps choose the next task
export interface IssueSummary {
  readonly id: string
  // What people say and type, such as `ACME-123`
  readonly key: string
  readonly summary: string
  readonly url: string
  readonly project: string
  readonly type: string
  readonly status: string
  readonly statusCategory: IssueStatusCategory
  readonly updatedAt: string
}

export type ViewItem =
  | ({ readonly kind: 'mergeRequest' } & MergeRequestSummary)
  | ({ readonly kind: 'issue' } & IssueSummary)

// A view declares one kind and its items are all of it
export type ViewItemKind = ViewItem['kind']

export type ViewState = 'unconfigured' | 'idle' | 'refreshing' | 'error'

export interface ViewSnapshot {
  // The id a connector declared for the view
  readonly view: string
  readonly items: readonly ViewItem[]
  // When the items were fetched from the server; undefined if never
  readonly updatedAt: number | undefined
  readonly state: ViewState
  readonly error: ErrorCode | undefined
}

// Fetches one connector's views for one account
export interface ViewSource {
  items(view: string): Promise<Result<readonly ViewItem[], ErrorBody>>
}

export interface CachedView {
  readonly items: readonly ViewItem[]
  readonly updatedAt: number
}

// `scope` identifies the account (the address): one account's data never shows up in another
export interface ViewCacheData {
  readonly scope: string
  readonly views: Readonly<Record<string, CachedView>>
}

export interface ViewCache {
  load(): Promise<ViewCacheData | undefined>
  save(data: ViewCacheData): Promise<void>
}
