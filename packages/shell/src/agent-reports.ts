import type { AgentLimit, AgentReportData, AgentSource } from '@dck/core'
import { z } from 'zod'

// Uma leitura do agente vale por pouco tempo: a sessão pode ter acabado sem aviso
const MAX_AGE_MS = 15 * 60 * 1000

export const reportMessage = z.object({
  agent: z.string(),
  ptyId: z.number().int(),
  payload: z.unknown(),
})

interface Stored {
  readonly data: AgentReportData
  readonly at: number
}

export interface ReportSummary {
  readonly agent: string
  readonly ptyId: number
  readonly context: boolean
  readonly window: boolean
  readonly cost: boolean
  readonly limits: number
  readonly transcript: boolean
}

// Só o que o relatório trouxe, nunca os valores: serve para ver por que a tela está vazia
function summarize(agent: string, ptyId: number, data: AgentReportData): ReportSummary {
  return {
    agent,
    ptyId,
    context: data.contextTokens !== undefined,
    window: data.contextWindow !== undefined,
    cost: data.costUsd !== undefined,
    limits: data.limits?.length ?? 0,
    transcript: data.transcriptPath !== undefined,
  }
}

// Guarda o que cada agente empurrou, por terminal, e os limites da conta, que valem para todos
export function createAgentReports(sources: readonly AgentSource[], now: () => number = Date.now) {
  const byTerminal = new Map<number, Stored>()
  const limitsByAgent = new Map<string, readonly AgentLimit[]>()

  return {
    // Devolve o que o relatório trouxe (sem o conteúdo), ou indefinido se foi recusado
    accept(message: unknown): ReportSummary | undefined {
      const parsed = reportMessage.safeParse(message)
      if (!parsed.success) return undefined
      const { agent, ptyId, payload } = parsed.data
      const data = sources.find((source) => source.profile.id === agent)?.report?.(payload)
      if (!data) return undefined
      byTerminal.set(ptyId, { data, at: now() })
      if (data.limits && data.limits.length > 0) limitsByAgent.set(agent, data.limits)
      return summarize(agent, ptyId, data)
    },
    // Dado do terminal, com os limites mais recentes que qualquer terminal desse agente trouxe
    latest(ptyId: number, agentId: string): AgentReportData | undefined {
      const stored = byTerminal.get(ptyId)
      const fresh = stored && now() - stored.at <= MAX_AGE_MS ? stored.data : undefined
      const limits = limitsByAgent.get(agentId)
      if (!fresh && !limits) return undefined
      return { ...fresh, ...(limits ? { limits } : {}) }
    },
    forget: (ptyId: number) => void byTerminal.delete(ptyId),
  }
}
