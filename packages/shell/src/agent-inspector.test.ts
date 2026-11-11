import type { AgentProfile, AgentSession, AgentSource } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createAgentInspector } from './agent-inspector.ts'

const profile: AgentProfile = { id: 'fake', name: 'Fake', processes: ['fake-agent'] }

function setup(foreground: string | undefined, read: () => Promise<AgentSession | undefined>) {
  const reads: Array<{ cwd: string; pid?: number; processStart?: string }> = []
  const source: AgentSource = {
    profile,
    read: async (context) => {
      reads.push(context)
      return read()
    },
  }
  const inspector = createAgentInspector({
    processes: {
      inspect: async () =>
        foreground === undefined
          ? undefined
          : { cwd: '/p/app', foreground, foregroundPid: 99, foregroundStart: '555' },
    },
    sources: [source],
  })
  return { inspector, reads }
}

describe('createAgentInspector', () => {
  it('should read the session from the source when its agent is in the foreground', async () => {
    const session: AgentSession = { agent: profile, contextTokens: 500, details: [] }
    const { inspector, reads } = setup('fake-agent', async () => session)

    expect(await inspector.session(1, 7)).toBe(session)
    expect(reads).toEqual([{ cwd: '/p/app', pid: 99, processStart: '555' }])
  })

  it('should be undefined when no known agent is in the foreground', async () => {
    const { inspector, reads } = setup('zsh', async () => undefined)

    expect(await inspector.session(1, 7)).toBeUndefined()
    expect(reads).toEqual([])
  })

  it('should return only the agent when the source has no data yet', async () => {
    const { inspector } = setup('fake-agent', async () => undefined)

    expect(await inspector.session(1, 7)).toEqual({ agent: profile, details: [] })
  })

  it('should be undefined when the process is gone', async () => {
    const { inspector } = setup(undefined, async () => undefined)

    expect(await inspector.session(1, 7)).toBeUndefined()
  })

  it('should let what the agent pushed override the file data when a report exists', async () => {
    const session: AgentSession = { agent: profile, contextTokens: 100, title: 'T', details: [] }
    const inspector = createAgentInspector({
      processes: { inspect: async () => ({ cwd: '/p/app', foreground: 'fake-agent' }) },
      sources: [{ profile, read: async () => session }],
      report: (ptyId) => (ptyId === 7 ? { contextTokens: 900, contextWindow: 1000 } : undefined),
    })

    expect(await inspector.session(1, 7)).toMatchObject({
      contextTokens: 900,
      contextWindow: 1000,
      title: 'T',
    })
    expect(await inspector.session(1, 8)).toMatchObject({ contextTokens: 100 })
  })
})
