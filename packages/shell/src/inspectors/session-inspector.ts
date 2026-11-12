import {
  type AgentProfile,
  classifyActivity,
  type GitInspector,
  type GitStatus,
  type ProcessInspector,
  type SessionActivityInfo,
  type SessionSnapshot,
  type StandardMarks,
} from '@dck/core'

export interface SessionInspectorDeps {
  readonly processes: ProcessInspector
  readonly git: GitInspector
  // Known agents, to recognize one of them in the foreground
  readonly agents?: readonly AgentProfile[]
  // What the branch and the commits not pushed yet fail of the repository's standards
  readonly standards?: { marks(git: GitStatus): Promise<StandardMarks | undefined> }
}

export function createSessionInspector(deps: SessionInspectorDeps) {
  const { processes, git, agents = [] } = deps

  async function readActivity(pid: number): Promise<SessionActivityInfo | undefined> {
    const info = await processes.inspect(pid)
    if (!info) return undefined
    const { activity, agent } = classifyActivity(info.foreground, agents)
    return {
      cwd: info.cwd,
      process: info.foreground,
      activity,
      ...(agent ? { agent } : {}),
    }
  }

  return {
    activity: readActivity,
    async snapshot(pid: number): Promise<SessionSnapshot | undefined> {
      const info = await readActivity(pid)
      if (!info) return undefined
      const status = await git.status(info.cwd)
      if (!status) return info
      const marks = await deps.standards?.marks(status)
      return { ...info, git: status, ...(marks ? { standards: marks } : {}) }
    },
  }
}
