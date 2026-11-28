import { describe, expect, it } from 'vitest'
import { createTerminalDirectories } from './terminal-directories.ts'

describe('createTerminalDirectories', () => {
  it('should give the folder a shell started in until the shell ends', () => {
    // Arrange
    const directories = createTerminalDirectories('win32')

    // Act
    directories.started(100, 'C:\\Users\\ana\\acme')
    const running = directories.get(100)
    directories.ended(100)

    // Assert
    expect(running).toBe('C:\\Users\\ana\\acme')
    expect(directories.get(100)).toBeUndefined()
  })

  it('should follow the folder the prompt reports when the shell changes it', () => {
    // Arrange
    const directories = createTerminalDirectories('win32')
    directories.started(100, 'C:\\Users\\ana')
    directories.started(200, 'C:\\Users\\ana')

    // Act
    directories.output(100, '\x1b]7;file://PC/C%3A/Users/ana/acme\x07PS C:\\Users\\ana\\acme> ')
    directories.output(100, 'plain output with no report')

    // Assert
    expect(directories.get(100)).toBe('C:\\Users\\ana\\acme')
    expect(directories.get(200)).toBe('C:\\Users\\ana')
  })

  it('should ignore output when the shell was never started here', () => {
    const directories = createTerminalDirectories('win32')

    directories.output(300, '\x1b]7;file://PC/C%3A/x\x07')

    expect(directories.get(300)).toBeUndefined()
  })
})
