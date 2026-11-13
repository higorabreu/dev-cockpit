import { type AgentProfile, createTranslator, type SessionActivityInfo } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { CONNECT_ITEM, createAgentConnect } from './agent-connect.ts'

const acme: AgentProfile = {
  id: 'acme',
  name: 'Acme Agent',
  processes: ['acme'],
  connect: { shell: 'acme plugin add dck', inAgent: '!acme plugin add dck' },
}
const plain: AgentProfile = { id: 'other', name: 'Other Agent', processes: ['other'] }

const atPrompt: SessionActivityInfo = { cwd: '/home/ana/acme', process: 'bash', activity: 'idle' }
const running = (agent: AgentProfile): SessionActivityInfo => ({
  cwd: '/home/ana/acme',
  process: agent.processes[0] ?? '',
  activity: 'agent',
  agent,
})

function setup(info: SessionActivityInfo | undefined, profiles = [plain, acme]) {
  const written: [string, string][] = []
  const connect = createAgentConnect({
    profiles: () => profiles,
    info: () => info,
    write: (tabId, text) => void written.push([tabId, text]),
  })
  return { connect, written }
}

describe('createAgentConnect', () => {
  it('should type the shell form without Enter when the tab is at a shell prompt', () => {
    const { connect, written } = setup(atPrompt)

    const typed = connect.connect('tab-1')

    expect(typed).toBe(true)
    expect(written).toEqual([['tab-1', 'acme plugin add dck']])
    expect(written[0]?.[1]).not.toMatch(/[\r\n]/)
  })

  it("should type the agent's own form when the agent runs in the foreground", () => {
    const { connect, written } = setup(running(acme))

    connect.connect('tab-1')

    expect(written).toEqual([['tab-1', '!acme plugin add dck']])
  })

  it('should type nothing when the agent in the foreground has no way to connect', () => {
    const { connect, written } = setup(running(plain))

    expect(connect.connect('tab-1')).toBe(false)
    expect(written).toEqual([])
  })

  it('should offer the menu item in both languages when an agent can connect', () => {
    const { connect } = setup(atPrompt)

    expect(connect.menuItems(createTranslator('en').t)).toEqual([
      { id: CONNECT_ITEM, label: 'Connect to the cockpit' },
    ])
    expect(connect.menuItems(createTranslator('pt-BR').t)).toEqual([
      { id: CONNECT_ITEM, label: 'Conectar ao cockpit' },
    ])
  })

  it('should leave the menu item out when no known agent can connect', () => {
    const { connect } = setup(atPrompt, [plain])

    expect(connect.menuItems(createTranslator('en').t)).toEqual([])
  })
})
