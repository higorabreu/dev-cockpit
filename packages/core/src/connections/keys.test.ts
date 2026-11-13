import { describe, expect, it } from 'vitest'
import { connectorTokenKey } from './keys.ts'

describe('connectorTokenKey', () => {
  it('should use the plain key when there is no profile', () => {
    expect(connectorTokenKey('gitlab', undefined)).toBe('gitlab.token')
    expect(connectorTokenKey('gitlab', '')).toBe('gitlab.token')
  })

  it('should prefix the key with the profile when there is one', () => {
    expect(connectorTokenKey('gitlab', 'dev')).toBe('dev:gitlab.token')
  })

  it('should give different keys to different profiles when they share the vault', () => {
    expect(connectorTokenKey('gitlab', 'dev')).not.toBe(connectorTokenKey('gitlab', undefined))
  })

  it('should give each connector its own key when two share a profile', () => {
    expect(connectorTokenKey('jira', 'dev')).toBe('dev:jira.token')
    expect(connectorTokenKey('jira', 'dev')).not.toBe(connectorTokenKey('gitlab', 'dev'))
  })
})
