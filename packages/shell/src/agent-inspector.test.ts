import type { AgentProfile, AgentSession, AgentSource } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createAgentInspector } from './agent-inspector.ts'

const profile: AgentProfile = { id: 'fake', name: 'Fake', processes: ['fake-agent'] }

function setup(foreground: string | undefined, read: () => Promise<AgentSession | undefined>) {
  const reads: string[] = []
  const source: AgentSource = {
    profile,
    read: async (cwd) => {
      reads.push(cwd)
      return read()
    },
  }
  const inspector = createAgentInspector({
    processes: {
      inspect: async () => (foreground === undefined ? undefined : { cwd: '/p/app', foreground }),
    },
    sources: [source],
  })
  return { inspector, reads }
}

describe('createAgentInspector', () => {
  it('should read the session from the source when its agent is in the foreground', async () => {
    const session: AgentSession = { agent: profile, contextTokens: 500, details: [] }
    const { inspector, reads } = setup('fake-agent', async () => session)

    expect(await inspector.session(1)).toBe(session)
    expect(reads).toEqual(['/p/app'])
  })

  it('should be undefined when no known agent is in the foreground', async () => {
    const { inspector, reads } = setup('zsh', async () => undefined)

    expect(await inspector.session(1)).toBeUndefined()
    expect(reads).toEqual([])
  })

  it('should return only the agent when the source has no data yet', async () => {
    const { inspector } = setup('fake-agent', async () => undefined)

    expect(await inspector.session(1)).toEqual({ agent: profile, details: [] })
  })

  it('should be undefined when the process is gone', async () => {
    const { inspector } = setup(undefined, async () => undefined)

    expect(await inspector.session(1)).toBeUndefined()
  })
})
