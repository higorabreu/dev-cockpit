import {
  type AgentProfile,
  classifyActivity,
  type GitInspector,
  type ProcessInspector,
  type SessionActivityInfo,
  type SessionSnapshot,
} from '@dck/core'

export interface SessionInspectorDeps {
  readonly processes: ProcessInspector
  readonly git: GitInspector
  // Agentes conhecidos, para reconhecer um deles em primeiro plano
  readonly agents?: readonly AgentProfile[]
}

export function createSessionInspector({ processes, git, agents = [] }: SessionInspectorDeps) {
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
      return { ...info, ...(status ? { git: status } : {}) }
    },
  }
}
