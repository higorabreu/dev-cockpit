import type { ExtensionSource } from '../extensions/load.ts'
import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'
import type { RuleField } from '../standards/fields.ts'
import type { AgentsFileState } from '../standards/workspace.ts'

export interface StandardView {
  readonly id: string
  readonly title: string
  readonly applies: string
  readonly why: string
  readonly enabled: boolean
  // Where the file with the last word lives
  readonly source: ExtensionSource
  readonly fields: readonly RuleField[]
}

export interface InvalidStandardView {
  readonly path: string
  readonly message: string
}

// The standards of one repository as the window shows them: plain data, so it crosses the IPC as it is
export interface StandardsView {
  readonly root: string
  readonly standards: readonly StandardView[]
  readonly invalid: readonly InvalidStandardView[]
  readonly agents: AgentsFileState
}

// The view after a change, or the failure the page shows beside the control
export type StandardsChange = Result<StandardsView, ErrorBody>

// What the Git section marks, as the messages of the rules that failed
export interface StandardMarks {
  readonly branch: readonly string[]
  // Keyed by the hash of a commit not pushed yet
  readonly commits: Readonly<Record<string, readonly string[]>>
}
