import { z } from 'zod'
import type { AgentState } from './agent-signal.ts'

// What a program's report about itself means for its tab: an agent state, or at rest with no answer
export type ProgramStatus = AgentState | 'idle'

// The Program Status Protocol, a draft terminal protocol that Codex's TUI writes to its own terminal
export const PROGRAM_STATUS_OSC = 7501

// A program asks whether the terminal reads the reports; one that does answers with the same mark
export const PROGRAM_STATUS_QUERY = '?'
export const PROGRAM_STATUS_REPLY = `\x1b]${PROGRAM_STATUS_OSC};?\x1b\\`

// A report with an id is a child record (a subagent, a task): only the terminal's own record counts
const reportSchema = z.object({
  state: z.enum(['idle', 'working', 'blocked', 'done', 'error', 'clear']),
  id: z.never().optional(),
})

const statusOf: Record<z.infer<typeof reportSchema>['state'], ProgramStatus> = {
  idle: 'idle',
  working: 'working',
  blocked: 'needs-you',
  done: 'your-turn',
  error: 'your-turn',
  clear: 'ended',
}

// Reads the body of an OSC 7501 report (`state=blocked:app=codex:kind=permission`); undefined to ignore it
export function readProgramStatus(payload: string): ProgramStatus | undefined {
  const pairs = new Map<string, string>()
  for (const pair of payload.split(':')) {
    const equals = pair.indexOf('=')
    // The protocol skips a malformed pair and lets a repeated key's last value win
    if (equals > 0) pairs.set(pair.slice(0, equals), pair.slice(equals + 1))
  }
  const report = reportSchema.safeParse(Object.fromEntries(pairs))
  return report.success ? statusOf[report.data.state] : undefined
}
