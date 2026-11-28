import { describe, expect, it } from 'vitest'
import { createTerminalDirectories } from './terminal-directories.ts'

describe('createTerminalDirectories', () => {
  it('should give the folder a shell started in until the shell ends', () => {
    // Arrange
    const directories = createTerminalDirectories()

    // Act
    directories.started(100, 'C:Usersanaacme')
    const running = directories.get(100)
    directories.ended(100)

    // Assert
    expect(running).toBe('C:Usersanaacme')
    expect(directories.get(100)).toBeUndefined()
  })
})
