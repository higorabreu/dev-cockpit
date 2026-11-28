import { describe, expect, it } from 'vitest'
import { temporaryEndpoint } from './temporary-endpoint.ts'

describe('temporaryEndpoint', () => {
  it('should give a new named pipe each time when the platform is Windows', () => {
    // Act
    const first = temporaryEndpoint('dck-test', 'win32')
    const second = temporaryEndpoint('dck-test', 'win32')

    // Assert
    expect(first).toMatch(/^\\\\\.\\pipe\\dck-test-[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
  })

  it('should give a socket in a new temporary folder when the platform is Unix', () => {
    // Act
    const endpoint = temporaryEndpoint('dck-test', 'linux')

    // Assert
    expect(endpoint).toMatch(/dck-test-[^/\\]+[/\\]daemon\.sock$/)
  })
})
