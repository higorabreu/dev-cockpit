import { describe, expect, it } from 'vitest'
import type { AgentProfile } from '../ports/agent.ts'
import { createConnectHint } from './connect-hint.ts'

const connectable: AgentProfile = {
  id: 'acme',
  name: 'Acme Agent',
  processes: ['acme'],
  connect: { shell: 'acme connect', inAgent: '!acme connect' },
}
const plain: AgentProfile = { id: 'other', name: 'Other Agent', processes: ['other'] }

function setup() {
  let now = 0
  let enabled = true
  const hint = createConnectHint({ clock: { now: () => now }, enabled: () => enabled })
  return {
    hint,
    advance: (ms: number) => {
      now += ms
    },
    disable: () => {
      enabled = false
    },
  }
}

describe('createConnectHint', () => {
  it('should suggest connecting when an agent with a connect command stays silent for 10 s', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)

    advance(9999)
    const early = hint.shown('a')
    advance(1)

    expect(early).toBeUndefined()
    expect(hint.shown('a')).toBe(connectable)
  })

  it('should not suggest anything when the agent has no connect command', () => {
    const { hint, advance } = setup()
    hint.update('a', plain)

    advance(60_000)

    expect(hint.shown('a')).toBeUndefined()
  })

  it('should not suggest anything when the tab never ran an agent', () => {
    const { hint, advance } = setup()
    hint.update('a', undefined)

    advance(60_000)

    expect(hint.shown('a')).toBeUndefined()
  })

  it('should hide the hint when the first signal arrives from the tab', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)
    advance(12_000)

    hint.signal('a')

    expect(hint.shown('a')).toBeUndefined()
  })

  it('should never show the hint when the signal arrives before the agent is seen', () => {
    const { hint, advance } = setup()
    hint.signal('a')

    hint.update('a', connectable)
    advance(12_000)

    expect(hint.shown('a')).toBeUndefined()
  })

  it('should hide the hint when the agent leaves the foreground', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)
    advance(12_000)

    hint.update('a', undefined)

    expect(hint.shown('a')).toBeUndefined()
  })

  it('should count the 10 s again when the agent starts again after leaving', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)
    advance(8000)
    hint.update('a', undefined)

    hint.update('a', connectable)
    advance(9999)
    expect(hint.shown('a')).toBeUndefined()
    advance(1)

    expect(hint.shown('a')).toBe(connectable)
  })

  it('should not suggest again in the same app run once the agent proved connected', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)
    hint.signal('a')
    hint.update('a', undefined)

    hint.update('a', connectable)
    advance(12_000)

    expect(hint.shown('a')).toBeUndefined()
  })

  it('should hide the hint for this run when Connect typed the command', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)
    advance(12_000)

    hint.handled('a')

    expect(hint.shown('a')).toBeUndefined()
  })

  it('should hide the hint when the user turned it off in settings', () => {
    const { hint, advance, disable } = setup()
    hint.update('a', connectable)
    advance(12_000)

    disable()

    expect(hint.shown('a')).toBeUndefined()
  })

  it('should hide the hint in every tab of the agent when one of them signals', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)
    hint.update('b', connectable)
    advance(12_000)

    hint.signal('a')

    expect(hint.shown('a')).toBeUndefined()
    expect(hint.shown('b')).toBeUndefined()
  })

  it('should hide the hint in every tab of the agent when Connect typed the command in one', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)
    hint.update('b', connectable)
    advance(12_000)

    hint.handled('a')

    expect(hint.shown('b')).toBeUndefined()
  })

  it('should keep the hint of another agent when one agent signals', () => {
    const { hint, advance } = setup()
    const other: AgentProfile = { ...connectable, id: 'zeta', processes: ['zeta'] }
    hint.update('a', connectable)
    hint.update('b', other)
    advance(12_000)

    hint.signal('a')

    expect(hint.shown('b')).toBe(other)
  })

  it('should forget the tab when it closes', () => {
    const { hint, advance } = setup()
    hint.update('a', connectable)
    advance(12_000)

    hint.forget('a')

    expect(hint.shown('a')).toBeUndefined()
  })
})
