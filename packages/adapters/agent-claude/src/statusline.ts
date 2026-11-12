import type { AgentLimit, AgentReportData } from '@dck/core'
import { z } from 'zod'

const number = z.number().nullish()

// Only what the screen uses from the JSON Claude Code sends to the statusLine; the rest is ignored
const statusline = z.object({
  transcript_path: z.string().nullish(),
  model: z.object({ id: z.string().nullish() }).nullish(),
  cost: z.object({ total_cost_usd: number }).nullish(),
  context_window: z
    .object({
      context_window_size: number,
      current_usage: z
        .object({
          input_tokens: number,
          cache_creation_input_tokens: number,
          cache_read_input_tokens: number,
        })
        .nullish(),
    })
    .nullish(),
  rate_limits: z
    .object({
      five_hour: z.object({ used_percentage: number, resets_at: number }).nullish(),
      seven_day: z.object({ used_percentage: number, resets_at: number }).nullish(),
    })
    .nullish(),
})

const LIMIT_IDS = { five_hour: 'fiveHour', seven_day: 'sevenDay' } as const

export function normalizeStatusline(payload: unknown): AgentReportData | undefined {
  const parsed = statusline.safeParse(payload)
  if (!parsed.success) return undefined
  const {
    model,
    cost,
    context_window: window,
    rate_limits: rates,
    transcript_path: transcript,
  } = parsed.data

  const usage = window?.current_usage
  // Same arithmetic as Claude Code: input only, cache created and cache read; output does not count
  const contextTokens = usage
    ? (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    : undefined

  const limits: AgentLimit[] = []
  for (const key of ['five_hour', 'seven_day'] as const) {
    const limit = rates?.[key]
    if (limit?.used_percentage != null && limit.resets_at != null) {
      limits.push({
        id: LIMIT_IDS[key],
        usedPercentage: limit.used_percentage,
        resetsAt: limit.resets_at * 1000,
      })
    }
  }

  return {
    ...(transcript ? { transcriptPath: transcript } : {}),
    ...(model?.id ? { model: model.id } : {}),
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(window?.context_window_size ? { contextWindow: window.context_window_size } : {}),
    ...(cost?.total_cost_usd != null ? { costUsd: cost.total_cost_usd, costEstimated: true } : {}),
    ...(limits.length > 0 ? { limits } : {}),
  }
}
