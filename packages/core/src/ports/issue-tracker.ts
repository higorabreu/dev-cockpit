import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'
import type { IssueSummary } from './views.ts'

export interface TrackerUser {
  readonly id: string
  // The name people recognize; a tracker account may have no username
  readonly name: string
}

// An issue tracker account, read only
export interface IssueTrackerSource {
  currentUser(): Promise<Result<TrackerUser, ErrorBody>>
  // The open issues assigned to the account, most recently updated first
  assignedIssues(): Promise<Result<readonly IssueSummary[], ErrorBody>>
}
