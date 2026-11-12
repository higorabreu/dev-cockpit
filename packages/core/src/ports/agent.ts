// How to recognize a coding agent (Claude Code, Codex, Aider...) running in a terminal
export interface AgentProfile {
  readonly id: string
  readonly name: string
  // Foreground process names that indicate this agent
  readonly processes: readonly string[]
}
