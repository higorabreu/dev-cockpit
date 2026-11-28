import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyActivity } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { agentProfiles } from './agent-profiles.ts'

const docs = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'agents.md'),
  'utf8',
)

describe('agentProfiles', () => {
  it('should recognize Claude Code by its process when listing the known agents', () => {
    const claude = agentProfiles.find((profile) => profile.id === 'claude-code')

    expect(claude?.name).toBe('Claude Code')
    expect(claude?.processes).toEqual(['claude', 'claude-code'])
  })

  it('should connect Claude Code with the documented commands and no Enter when typed', () => {
    const connect = agentProfiles.find((profile) => profile.id === 'claude-code')?.connect

    expect(connect?.shell).toBe(
      'claude plugin marketplace add higorabreu/dev-cockpit && claude plugin install dck@dev-cockpit',
    )
    expect(connect?.inAgent).toBe(`!${connect?.shell}`)
    expect(docs).toContain(connect?.shell)
    expect(`${connect?.shell}${connect?.inAgent}`).not.toMatch(/[\r\n]/)
  })

  it('should recognize Codex by its native process when Codex runs in the foreground', () => {
    // Arrange: the name /proc gives for Codex 0.169.0 started from npm, checked on the real binary
    const foreground = 'codex'

    // Act
    const { activity, agent } = classifyActivity(foreground, agentProfiles)

    // Assert
    expect(activity).toBe('agent')
    expect(agent?.id).toBe('codex')
    expect(agent?.name).toBe('Codex')
  })

  it('should offer no connect command for Codex when its terminal reports carry its state', () => {
    const codex = agentProfiles.find((profile) => profile.id === 'codex')

    expect(codex?.connect).toBeUndefined()
    expect(docs).toContain('## Codex')
  })

  it('should keep Node itself an ordinary command when an older Node runs the Codex launcher', () => {
    expect(classifyActivity('node', agentProfiles)).toEqual({ activity: 'busy' })
  })
})
