import {
  type AgentSession,
  type AgentSource,
  classifyActivity,
  type ProcessInspector,
} from '@dck/core'

export interface AgentInspectorDeps {
  readonly processes: ProcessInspector
  readonly sources: readonly AgentSource[]
}

export function createAgentInspector({ processes, sources }: AgentInspectorDeps) {
  const profiles = sources.map((source) => source.profile)

  return {
    // Indefinido quando nenhum agente conhecido está em primeiro plano na sessão
    async session(pid: number): Promise<AgentSession | undefined> {
      const info = await processes.inspect(pid)
      if (!info) return undefined
      const { agent } = classifyActivity(info.foreground, profiles)
      if (!agent) return undefined
      const source = sources.find((candidate) => candidate.profile.id === agent.id)
      // O agente roda mas a fonte ainda não tem dados dele: a tela mostra só o nome
      return (await source?.read(info.cwd)) ?? { agent, details: [] }
    },
  }
}
