import {
  classifyActivity,
  type GitInspector,
  type ProcessInspector,
  type SessionActivityInfo,
  type SessionSnapshot,
} from '@dck/core'

export interface SessionInspectorDeps {
  readonly processes: ProcessInspector
  readonly git: GitInspector
}

export function createSessionInspector({ processes, git }: SessionInspectorDeps) {
  async function activity(pid: number): Promise<SessionActivityInfo | undefined> {
    const info = await processes.inspect(pid)
    if (!info) return undefined
    return { cwd: info.cwd, process: info.foreground, activity: classifyActivity(info.foreground) }
  }

  return {
    activity,
    async snapshot(pid: number): Promise<SessionSnapshot | undefined> {
      const info = await activity(pid)
      if (!info) return undefined
      const status = await git.status(info.cwd)
      return { ...info, ...(status ? { git: status } : {}) }
    },
  }
}
