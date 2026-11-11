import {
  classifyActivity,
  type GitInspector,
  type ProcessInspector,
  type SessionSnapshot,
} from '@dck/core'

export interface SessionInspectorDeps {
  readonly processes: ProcessInspector
  readonly git: GitInspector
}

export function createSessionInspector({ processes, git }: SessionInspectorDeps) {
  return {
    async snapshot(pid: number): Promise<SessionSnapshot | undefined> {
      const info = await processes.inspect(pid)
      if (!info) return undefined
      const status = await git.status(info.cwd)
      return {
        cwd: info.cwd,
        process: info.foreground,
        activity: classifyActivity(info.foreground),
        ...(status ? { git: status } : {}),
      }
    },
  }
}
