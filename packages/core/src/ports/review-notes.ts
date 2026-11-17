import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'

// Where the review's pending comments are written for the agent to read: a file the agent can open
// without asking, which git never shows as a change
export interface ReviewNotes {
  // Writes the Markdown of a review of the repository at `root` and answers the file's absolute path
  save(root: string, markdown: string): Promise<Result<string, ErrorBody>>
}
