// How to recognize a coding agent (Claude Code, Codex, Aider...) running in a terminal
export interface AgentProfile {
  readonly id: string
  readonly name: string
  // Foreground process names that indicate this agent
  readonly processes: readonly string[]
  // How to wire the agent's own events to `dck agent signal`, when the agent has a way to
  readonly connect?: AgentConnect
}

// Text typed into the terminal without Enter, so the user reads what will run and confirms it
export interface AgentConnect {
  // At a shell prompt
  readonly shell: string
  // Into the agent's own prompt while it runs, where the shell form would be read as a message
  readonly inAgent: string
}
