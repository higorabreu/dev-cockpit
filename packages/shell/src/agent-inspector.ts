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
  // O que o próprio agente empurrou para esse terminal, se algo
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
    // Indefinido quando nenhum agente conhecido está em primeiro plano na sessão
    async session(pid: number, ptyId: number): Promise<AgentSession | undefined> {
      const info = await processes.inspect(pid)
      if (!info) return undefined
      const { agent } = classifyActivity(info.foreground, profiles)
      if (!agent) return undefined
      const source = sources.find((candidate) => candidate.profile.id === agent.id)
      // O agente roda mas a fonte ainda não tem dados dele: a tela mostra só o nome
      const reported = report?.(ptyId, agent.id)
      const base = (await source?.read({
        cwd: info.cwd,
        ...(info.foregroundPid !== undefined ? { pid: info.foregroundPid } : {}),
        ...(info.foregroundStart !== undefined ? { processStart: info.foregroundStart } : {}),
        // O que o agente diz que está na tela vale mais que o registro do processo
        ...(reported?.transcriptPath ? { transcriptPath: reported.transcriptPath } : {}),
      })) ?? { agent, details: [] }
      return mergeReport(base, reported, now())
    },
  }
}
