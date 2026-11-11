import { describe, expect, it } from 'vitest'
import type { AgentProfile } from '../ports/agent.ts'
import { classifyActivity } from './activity.ts'

const claude: AgentProfile = { id: 'claude', name: 'Claude', processes: ['claude'] }
const codex: AgentProfile = { id: 'codex', name: 'Codex', processes: ['codex', 'codex-cli'] }

describe('classifyActivity', () => {
  it('should be idle when the foreground process is a shell', () => {
    expect(classifyActivity('zsh').activity).toBe('idle')
    expect(classifyActivity('bash').activity).toBe('idle')
  })

  it('should recognize a known agent when its process is in the foreground', () => {
    const result = classifyActivity('claude', [claude, codex])

    expect(result).toEqual({ activity: 'agent', agent: claude })
  })

  it('should recognize any of the process names an agent declares when classifying', () => {
    expect(classifyActivity('codex-cli', [claude, codex]).agent).toBe(codex)
  })

  it('should be busy when the process is not a shell nor a known agent', () => {
    expect(classifyActivity('pnpm', [claude, codex])).toEqual({ activity: 'busy' })
  })

  it('should treat an agent as a plain command when no agent profile is given', () => {
    expect(classifyActivity('claude').activity).toBe('busy')
  })

  it('should ignore case and surrounding spaces when classifying', () => {
    expect(classifyActivity(' ZSH\n').activity).toBe('idle')
    expect(classifyActivity(' Claude ', [claude]).activity).toBe('agent')
  })
})
