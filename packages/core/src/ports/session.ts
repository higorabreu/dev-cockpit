import type { AgentProfile } from './agent.ts'

// File state letter, as in Source Control: M modified, A new in the index, D deleted,
// R renamed, U untracked, ! conflicted
export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | 'U' | '!'

export interface GitFile {
  readonly status: GitFileStatus
  readonly path: string
}

export interface GitCommit {
  readonly hash: string
  readonly subject: string
  // Segundos desde 1970, como o git entrega
  readonly time: number
}

export interface GitSubmodule {
  readonly path: string
  readonly changed: number
  readonly ahead: number
  readonly behind: number
}

export interface GitStatus {
  readonly root: string
  // Undefined with a detached HEAD
  readonly branch: string | undefined
  readonly upstream: string | undefined
  // Distinct files, not counting submodules
  readonly changed: number
  readonly staged: readonly GitFile[]
  readonly changes: readonly GitFile[]
  readonly ahead: number
  readonly behind: number
  // Commits not yet pushed and remote commits not yet pulled, most recent first
  readonly outgoing: readonly GitCommit[]
  readonly incoming: readonly GitCommit[]
  // Only submodules with pending changes
  readonly submodules: readonly GitSubmodule[]
  readonly submodulesClean: number
}

export interface GitInspector {
  // Undefined when the directory is not inside a repository
  status(cwd: string): Promise<GitStatus | undefined>
}

export interface ProcessInfo {
  readonly cwd: string
  // Name of the foreground process in the session terminal
  readonly foreground: string
  // Exact identity of that process; the start time tells apart a reused PID
  readonly foregroundPid?: number
  readonly foregroundStart?: string
}

export interface ProcessInspector {
  inspect(pid: number): Promise<ProcessInfo | undefined>
}

export type SessionActivity = 'idle' | 'agent' | 'busy'

export interface SessionActivityInfo {
  readonly cwd: string
  readonly process: string
  readonly activity: SessionActivity
  // Present when what runs in the foreground is a known agent
  readonly agent?: AgentProfile
}

export interface SessionSnapshot extends SessionActivityInfo {
  readonly git?: GitStatus
}
