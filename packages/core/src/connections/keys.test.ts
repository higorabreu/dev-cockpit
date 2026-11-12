import { describe, expect, it } from 'vitest'
import { gitlabTokenKey } from './keys.ts'

describe('gitlabTokenKey', () => {
  it('should use the plain key when there is no profile', () => {
    expect(gitlabTokenKey(undefined)).toBe('gitlab.token')
    expect(gitlabTokenKey('')).toBe('gitlab.token')
  })

  it('should prefix the key with the profile when there is one', () => {
    expect(gitlabTokenKey('dev')).toBe('dev:gitlab.token')
  })

  it('should give different keys to different profiles when they share the vault', () => {
    expect(gitlabTokenKey('dev')).not.toBe(gitlabTokenKey(undefined))
  })
})
