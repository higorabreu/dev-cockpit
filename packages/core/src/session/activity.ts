import type { AgentProfile } from '../ports/agent.ts'
import { type SessionActivity, UNKNOWN_FOREGROUND } from '../ports/session.ts'

const SHELLS = new Set(['bash', 'zsh', 'fish', 'sh', 'dash', 'ksh', 'tcsh'])

export interface Classification {
  readonly activity: SessionActivity
  readonly agent?: AgentProfile
}

// Classifies what is in the foreground: the shell prompt, a known agent or another command
export function classifyActivity(
  foreground: string,
  agents: readonly AgentProfile[] = [],
): Classification {
  const name = foreground.trim().toLowerCase()
  if (SHELLS.has(name)) return { activity: 'idle' }
  // Something holds the terminal even when its name cannot be read
  if (name === UNKNOWN_FOREGROUND) return { activity: 'busy' }
  const agent = agents.find((profile) =>
    profile.processes.some((process) => process.toLowerCase() === name),
  )
  return agent ? { activity: 'agent', agent } : { activity: 'busy' }
}
