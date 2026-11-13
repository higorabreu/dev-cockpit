import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    expect(claude?.processes).toEqual(['claude'])
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
})
