import type { ExtensionSource } from '../extensions/load.ts'
import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'
import type { RuleField } from '../rules/fields.ts'
import type { AgentsFileState } from '../rules/workspace.ts'

export interface RuleView {
  readonly id: string
  readonly title: string
  readonly applies: string
  readonly why: string
  readonly enabled: boolean
  // Where the file with the last word lives
  readonly source: ExtensionSource
  readonly fields: readonly RuleField[]
}

export interface InvalidRuleView {
  readonly path: string
  readonly message: string
}

// The rules of one repository as the window shows them: plain data, so it crosses the IPC as it is
export interface RulesView {
  readonly root: string
  readonly rules: readonly RuleView[]
  readonly invalid: readonly InvalidRuleView[]
  readonly agents: AgentsFileState
}

// The view after a change, or the failure the page shows beside the control
export type RulesChange = Result<RulesView, ErrorBody>

// What one branch or commit fails, as check messages
export interface RuleMark {
  readonly failed: readonly string[]
  // Ran out of time, so they were not judged
  readonly slow: readonly string[]
}

// What the Git section marks; a branch or commit inside every enabled rule is left out
export interface RuleMarks {
  readonly branch?: RuleMark
  // Keyed by the hash of a commit not pushed yet
  readonly commits: Readonly<Record<string, RuleMark>>
}
