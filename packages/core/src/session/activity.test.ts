import { describe, expect, it } from 'vitest'
import { classifyActivity } from './activity.ts'

describe('classifyActivity', () => {
  it('should be idle when the foreground process is a shell', () => {
    expect(classifyActivity('zsh')).toBe('idle')
    expect(classifyActivity('bash')).toBe('idle')
  })

  it('should be claude when the foreground process is the claude cli', () => {
    expect(classifyActivity('claude')).toBe('claude')
  })

  it('should be busy when any other command is running', () => {
    expect(classifyActivity('pnpm')).toBe('busy')
  })

  it('should ignore case and surrounding spaces when classifying', () => {
    expect(classifyActivity(' ZSH\n')).toBe('idle')
  })
})
