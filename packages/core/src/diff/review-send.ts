import { shellQuote } from '../paste/paste-paths.ts'
import type { AgentProfile } from '../ports/agent.ts'
import type { SessionActivityInfo } from '../ports/session.ts'

// What "Send to agent" does, by what runs in the tab's foreground: type the line to a running agent, start
// one of the installed agents with it at a shell prompt, or wait while another program holds the terminal
export type ReviewSendMode =
  | { readonly kind: 'agent' }
  | { readonly kind: 'start'; readonly agents: readonly AgentProfile[] }
  | { readonly kind: 'no-agent'; readonly commands: readonly string[] }
  | { readonly kind: 'busy'; readonly process: string }

// The word a shell runs, which is what has to be found on the PATH
export const launchCommand = (launch: string): string => launch.trim().split(/\s+/)[0] ?? ''

// An unknown activity (no read has come yet) keeps the line, as before the cases were told apart
export function reviewSendMode(
  activity: SessionActivityInfo | undefined,
  launchable: readonly AgentProfile[],
  profiles: readonly AgentProfile[],
): ReviewSendMode {
  if (activity?.activity === 'busy') return { kind: 'busy', process: activity.process }
  if (activity?.activity !== 'idle') return { kind: 'agent' }
  const agents = launchable.filter((agent) => agent.launch)
  if (agents.length > 0) return { kind: 'start', agents }
  const commands = profiles.flatMap((agent) => (agent.launch ? [launchCommand(agent.launch)] : []))
  return { kind: 'no-agent', commands }
}

// Typed at a shell prompt without Enter: the agent's command with the prompt as one quoted argument
export function launchText(launch: string, prompt: string): string {
  return `${launch.trim()} ${shellQuote(prompt)}`
}
