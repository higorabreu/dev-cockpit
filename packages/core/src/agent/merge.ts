import type { AgentLimit, AgentReportData, AgentSession } from '../ports/agent.ts'

// Limits that already renewed no longer apply: the next window has no number yet
export function activeLimits(
  limits: readonly AgentLimit[] | undefined,
  nowMs: number,
): readonly AgentLimit[] {
  return (limits ?? []).filter((limit) => limit.resetsAt > nowMs)
}

// What the agent pushes is more complete than the session file and takes precedence over it
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
