import { describe, expect, it } from 'vitest'
import type { AgentSession } from '../ports/agent.ts'
import { activeLimits, mergeReport } from './merge.ts'

const profile = { id: 'fake', name: 'Fake', processes: ['fake'] }
const base: AgentSession = {
  agent: profile,
  model: 'old-model',
  contextTokens: 100,
  title: 'Título',
  details: [{ id: 'permissionMode', value: 'plan' }],
}
const NOW = 1_000_000

describe('mergeReport', () => {
  it('should keep the base when there is no report', () => {
    expect(mergeReport(base, undefined, NOW)).toBe(base)
  })

  it('should let the report override the fields it carries when merging', () => {
    const merged = mergeReport(
      base,
      { model: 'new-model', contextTokens: 500, contextWindow: 1_000_000 },
      NOW,
    )

    expect(merged).toMatchObject({
      model: 'new-model',
      contextTokens: 500,
      contextWindow: 1_000_000,
    })
  })

  it('should keep the title and details from the base when the report has none', () => {
    const merged = mergeReport(base, { contextTokens: 1 }, NOW)

    expect(merged.title).toBe('Título')
    expect(merged.details).toEqual(base.details)
  })

  it('should carry the cost and mark it as an estimate when the report says so', () => {
    const merged = mergeReport(base, { costUsd: 3.42, costEstimated: true }, NOW)

    expect(merged).toMatchObject({ costUsd: 3.42, costEstimated: true })
  })

  it('should drop limits that already renewed when merging', () => {
    const merged = mergeReport(
      base,
      {
        limits: [
          { id: 'fiveHour', usedPercentage: 40, resetsAt: NOW + 60_000 },
          { id: 'sevenDay', usedPercentage: 10, resetsAt: NOW - 1 },
        ],
      },
      NOW,
    )

    expect(merged.limits).toEqual([{ id: 'fiveHour', usedPercentage: 40, resetsAt: NOW + 60_000 }])
  })

  it('should leave the limits out when none is still active', () => {
    const merged = mergeReport(
      base,
      { limits: [{ id: 'fiveHour', usedPercentage: 1, resetsAt: NOW - 5 }] },
      NOW,
    )

    expect(merged.limits).toBeUndefined()
  })
})

describe('activeLimits', () => {
  it('should be empty when there are no limits', () => {
    expect(activeLimits(undefined, NOW)).toEqual([])
  })
})
