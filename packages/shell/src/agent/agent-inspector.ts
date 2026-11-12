import {
  type AgentReportData,
  type AgentSession,
  type AgentSource,
  classifyActivity,
  mergeReport,
  type ProcessInspector,
} from '@dck/core'

export interface AgentInspectorDeps {
  readonly processes: ProcessInspector
  readonly sources: readonly AgentSource[]
  // What the agent itself pushed to this terminal, if anything
  report?(ptyId: number, agentId: string): AgentReportData | undefined
  readonly now?: () => number
}

export function createAgentInspector({
  processes,
  sources,
  report,
  now = Date.now,
}: AgentInspectorDeps) {
  const profiles = sources.map((source) => source.profile)

  return {
    // Undefined when no known agent is in the foreground of the session
    async session(pid: number, ptyId: number): Promise<AgentSession | undefined> {
      const info = await processes.inspect(pid)
      if (!info) return undefined
      const { agent } = classifyActivity(info.foreground, profiles)
      if (!agent) return undefined
      const source = sources.find((candidate) => candidate.profile.id === agent.id)
      // The agent is running but the source has no data for it yet: the screen shows only the name
      const reported = report?.(ptyId, agent.id)
      const base = (await source?.read({
        cwd: info.cwd,
        ...(info.foregroundPid !== undefined ? { pid: info.foregroundPid } : {}),
        ...(info.foregroundStart !== undefined ? { processStart: info.foregroundStart } : {}),
        // What the agent says is on screen beats the process record
        ...(reported?.transcriptPath ? { transcriptPath: reported.transcriptPath } : {}),
      })) ?? { agent, details: [] }
      return mergeReport(base, reported, now())
    },
  }
}
