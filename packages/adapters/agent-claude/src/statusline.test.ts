import { describe, expect, it } from 'vitest'
import { normalizeStatusline } from './statusline.ts'

// Example from the official Claude Code statusLine documentation
const payload = {
  session_id: 'abc123',
  transcript_path: '/home/u/.claude/projects/-p-app/abc123.jsonl',
  model: { id: 'claude-opus-4-1', display_name: 'Opus' },
  cost: { total_cost_usd: 0.01234, total_duration_ms: 45000 },
  context_window: {
    total_input_tokens: 15234,
    context_window_size: 200000,
    used_percentage: 8,
    current_usage: {
      input_tokens: 8500,
      output_tokens: 1200,
      cache_creation_input_tokens: 5000,
      cache_read_input_tokens: 2000,
    },
  },
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
    seven_day: { used_percentage: 41.2, resets_at: 1738857600 },
  },
}

describe('normalizeStatusline', () => {
  it('should read the model, window, cost and limits when the payload has them all', () => {
    const data = normalizeStatusline(payload)

    expect(data).toEqual({
      transcriptPath: '/home/u/.claude/projects/-p-app/abc123.jsonl',
      model: 'claude-opus-4-1',
      contextTokens: 15_500,
      contextWindow: 200_000,
      costUsd: 0.01234,
      costEstimated: true,
      limits: [
        { id: 'fiveHour', usedPercentage: 23.5, resetsAt: 1738425600_000 },
        { id: 'sevenDay', usedPercentage: 41.2, resetsAt: 1738857600_000 },
      ],
    })
  })

  it('should not count output tokens in the context when summing the usage', () => {
    const data = normalizeStatusline({
      context_window: { current_usage: { input_tokens: 10, output_tokens: 9999 } },
    })

    expect(data?.contextTokens).toBe(10)
  })

  it('should leave the context out when there is no usage yet', () => {
    const data = normalizeStatusline({
      context_window: { context_window_size: 200000, current_usage: null },
    })

    expect(data).toEqual({ contextWindow: 200_000 })
  })

  it('should leave the limits out when the account has none', () => {
    expect(normalizeStatusline({ model: { id: 'm' } })).toEqual({ model: 'm' })
  })

  it('should keep a limit window alone when the other one is missing', () => {
    const data = normalizeStatusline({
      rate_limits: { five_hour: { used_percentage: 5, resets_at: 100 } },
    })

    expect(data?.limits).toEqual([{ id: 'fiveHour', usedPercentage: 5, resetsAt: 100_000 }])
  })

  it('should ignore unknown fields and fail soft on a malformed payload', () => {
    expect(normalizeStatusline({ model: { id: 'm' }, surprise: { nested: true } })).toEqual({
      model: 'm',
    })
    expect(normalizeStatusline('not an object')).toBeUndefined()
    expect(normalizeStatusline({ cost: { total_cost_usd: 'caro' } })).toBeUndefined()
  })
})
