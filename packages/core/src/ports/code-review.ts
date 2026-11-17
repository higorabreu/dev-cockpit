import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'

export interface ReviewUser {
  readonly id: string
  readonly username: string
  readonly name: string
}

// `none`: the MR has no pipeline. `unknown`: it could not be queried.
export type PipelineState =
  | 'success'
  | 'failed'
  | 'running'
  | 'pending'
  | 'canceled'
  | 'none'
  | 'unknown'

// What separates the project from the number in a reference: GitLab's `acme/backend!12`, GitHub's `#12`
export type ReferenceMark = '!' | '#'

export interface MergeRequestSummary {
  readonly id: string
  readonly number: number
  readonly title: string
  readonly url: string
  readonly project: string
  readonly author: string
  readonly sourceBranch: string
  readonly targetBranch: string
  readonly draft: boolean
  readonly updatedAt: string
  readonly hasConflicts: boolean
  readonly openDiscussions: boolean
  readonly pipeline: PipelineState
  // `!` when absent, so GitLab items and the caches written before GitHub keep their reference
  readonly referenceMark?: ReferenceMark
}

// `review`: waiting for my review. `mine`: opened by me
export type MergeRequestView = 'review' | 'mine'

export interface CodeReviewSource {
  currentUser(): Promise<Result<ReviewUser, ErrorBody>>
  mergeRequests(view: MergeRequestView): Promise<Result<readonly MergeRequestSummary[], ErrorBody>>
}
