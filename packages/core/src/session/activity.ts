import type { AgentProfile } from '../ports/agent.ts'
import type { SessionActivity } from '../ports/session.ts'

const SHELLS = new Set(['bash', 'zsh', 'fish', 'sh', 'dash', 'ksh', 'tcsh'])

export interface Classification {
  readonly activity: SessionActivity
  readonly agent?: AgentProfile
}

// Classifica o que está em primeiro plano: o prompt do shell, um agente conhecido ou outro comando
export function classifyActivity(
  foreground: string,
  agents: readonly AgentProfile[] = [],
): Classification {
  const name = foreground.trim().toLowerCase()
  if (SHELLS.has(name)) return { activity: 'idle' }
  const agent = agents.find((profile) =>
    profile.processes.some((process) => process.toLowerCase() === name),
  )
  return agent ? { activity: 'agent', agent } : { activity: 'busy' }
}
