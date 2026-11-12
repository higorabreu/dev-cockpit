// How to recognize a coding agent (Claude Code, Codex, Aider...) running in a terminal
export interface AgentProfile {
  readonly id: string
  readonly name: string
  // Foreground process names that indicate this agent
  readonly processes: readonly string[]
}

export interface AgentDetail {
  // Known identifier (like `permissionMode`) that the UI knows how to translate
  readonly id: string
  readonly value: string
}

// Um limite de uso da conta, como a janela de 5 horas
export interface AgentLimit {
  // Known identifier (`fiveHour`, `sevenDay`) that the UI knows how to translate
  readonly id: string
  readonly usedPercentage: number
  // When the limit renews, in milliseconds since 1970
  readonly resetsAt: number
}

// What the agent pushes during the session (for example through Claude Code's statusLine)
export interface AgentReportData {
  // Session file on screen, as reported by the agent; beats any guess
  readonly transcriptPath?: string
  readonly model?: string
  readonly contextTokens?: number
  readonly contextWindow?: number
  readonly costUsd?: number
  readonly costEstimated?: boolean
  readonly limits?: readonly AgentLimit[]
}

// What is known about an agent session. Everything is optional: each source reports only what it has,
// and the UI shows only what arrived
export interface AgentSession {
  readonly agent: AgentProfile
  readonly model?: string
  // Tokens in the context at the last model call
  readonly contextTokens?: number
  readonly contextWindow?: number
  readonly costUsd?: number
  // When true, the cost is an estimate and the UI must say so
  readonly costEstimated?: boolean
  // Time of the last response, in milliseconds since 1970
  readonly lastResponseAt?: number
  readonly title?: string
  readonly limits?: readonly AgentLimit[]
  readonly details: readonly AgentDetail[]
}

// Where the agent runs: the tab directory and, when known, the exact foreground process
export interface AgentContext {
  readonly cwd: string
  readonly pid?: number
  // Process start (starttime from /proc), to avoid confusing it with a reused PID
  readonly processStart?: string
  // Session file reported by the agent itself, when it pushed one
  readonly transcriptPath?: string
}

// A data source for an agent: knows how to recognize it and read its session from the directory
export interface AgentSource {
  readonly profile: AgentProfile
  read(context: AgentContext): Promise<AgentSession | undefined>
  // Translates what the agent pushes into the neutral model; undefined if it is not recognized
  report?(payload: unknown): AgentReportData | undefined
}
