import type { AgentLimit, AgentReportData, AgentSource } from '@dck/core'
import { z } from 'zod'

// An agent reading is valid for a short time: the session may have ended without notice
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

// Only what the report carried, never the values: lets you see why the screen is empty
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

// Keeps what each agent pushed, per terminal, and the account limits, which apply to all
export function createAgentReports(sources: readonly AgentSource[], now: () => number = Date.now) {
  const byTerminal = new Map<number, Stored>()
  const limitsByAgent = new Map<string, readonly AgentLimit[]>()

  return {
    // Returns what the report carried (without the content), or undefined if it was refused
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
    // Terminal data, with the most recent limits that any terminal of this agent brought
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
