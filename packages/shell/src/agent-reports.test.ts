import type { AgentSource } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createAgentReports } from './agent-reports.ts'

const profile = { id: 'fake', name: 'Fake', processes: ['fake'] }
const source: AgentSource = {
  profile,
  read: async () => undefined,
  report: (payload) => {
    const value = payload as { tokens?: number; limit?: number } | null
    if (!value || typeof value !== 'object') return undefined
    return {
      ...(value.tokens !== undefined ? { contextTokens: value.tokens } : {}),
      ...(value.limit !== undefined
        ? { limits: [{ id: 'fiveHour', usedPercentage: value.limit, resetsAt: 9_999_999 }] }
        : {}),
    }
  },
}

function setup() {
  let now = 1000
  const reports = createAgentReports([source], () => now)
  return {
    reports,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('createAgentReports', () => {
  it('should keep what the agent pushed for a terminal when the report is understood', () => {
    const { reports } = setup()

    const accepted = reports.accept({ agent: 'fake', ptyId: 2, payload: { tokens: 500 } })

    expect(accepted).toBe(true)
    expect(reports.latest(2, 'fake')).toEqual({ contextTokens: 500 })
  })

  it('should refuse a report when the agent is unknown or the message is malformed', () => {
    const { reports } = setup()

    expect(reports.accept({ agent: 'other', ptyId: 2, payload: {} })).toBe(false)
    expect(reports.accept({ agent: 'fake', ptyId: 'x' })).toBe(false)
    expect(reports.accept('nope')).toBe(false)
  })

  it('should share the account limits with every terminal of the agent when one reports them', () => {
    const { reports } = setup()
    reports.accept({ agent: 'fake', ptyId: 1, payload: { tokens: 1, limit: 40 } })

    expect(reports.latest(9, 'fake')?.limits).toEqual([
      { id: 'fiveHour', usedPercentage: 40, resetsAt: 9_999_999 },
    ])
  })

  it('should drop the terminal data but keep the limits when the report is old', () => {
    const { reports, advance } = setup()
    reports.accept({ agent: 'fake', ptyId: 1, payload: { tokens: 700, limit: 10 } })

    advance(16 * 60 * 1000)

    const latest = reports.latest(1, 'fake')
    expect(latest?.contextTokens).toBeUndefined()
    expect(latest?.limits).toHaveLength(1)
  })

  it('should return nothing when the terminal never reported and no limit is known', () => {
    expect(setup().reports.latest(1, 'fake')).toBeUndefined()
  })

  it('should forget a terminal when it is closed', () => {
    const { reports } = setup()
    reports.accept({ agent: 'fake', ptyId: 1, payload: { tokens: 5 } })

    reports.forget(1)

    expect(reports.latest(1, 'fake')).toBeUndefined()
  })
})
