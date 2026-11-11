import type { AgentLimit, AgentReportData, AgentSession } from '../ports/agent.ts'

// Limites que já renovaram deixam de valer: a janela seguinte ainda não tem número
export function activeLimits(
  limits: readonly AgentLimit[] | undefined,
  nowMs: number,
): readonly AgentLimit[] {
  return (limits ?? []).filter((limit) => limit.resetsAt > nowMs)
}

// O que o agente empurra é mais completo que o arquivo de sessão e vale por cima dele
export function mergeReport(
  base: AgentSession,
  report: AgentReportData | undefined,
  nowMs: number,
): AgentSession {
  if (!report) return base
  const limits = activeLimits(report.limits, nowMs)
  return {
    ...base,
    ...(report.model ? { model: report.model } : {}),
    ...(report.contextTokens !== undefined ? { contextTokens: report.contextTokens } : {}),
    ...(report.contextWindow !== undefined ? { contextWindow: report.contextWindow } : {}),
    ...(report.costUsd !== undefined
      ? { costUsd: report.costUsd, costEstimated: report.costEstimated ?? false }
      : {}),
    ...(limits.length > 0 ? { limits } : {}),
  }
}
