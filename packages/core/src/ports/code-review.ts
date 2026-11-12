import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'

export interface ReviewUser {
  readonly id: string
  readonly username: string
  readonly name: string
}

// `none`: a MR não tem pipeline. `unknown`: não deu para consultar.
export type PipelineState =
  | 'success'
  | 'failed'
  | 'running'
  | 'pending'
  | 'canceled'
  | 'none'
  | 'unknown'

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
}

// `review`: esperando a minha review. `mine`: abertas por mim.
export type MergeRequestView = 'review' | 'mine'

export interface CodeReviewSource {
  currentUser(): Promise<Result<ReviewUser, ErrorBody>>
  mergeRequests(view: MergeRequestView): Promise<Result<readonly MergeRequestSummary[], ErrorBody>>
}
