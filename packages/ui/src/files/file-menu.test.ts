import { describe, expect, it } from 'vitest'
import { fileMenu } from './file-menu.ts'

const action = (label: string) => ({ label, enabled: true, run: () => undefined })
const commands = [action('Save'), action('Close file')]

describe('fileMenu', () => {
  it('should list the recent files under the caption and the commands under them when there are some', () => {
    // Arrange
    const recent = [action('users.ts'), action('README.md')]

    // Act
    const menu = fileMenu(recent, 'Recent files', commands)

    // Assert
    expect(menu.actions.map((item) => item.label)).toEqual(['users.ts', 'README.md'])
    expect(menu.options.caption).toBe('Recent files')
    expect(menu.options.footer?.map((item) => item.label)).toEqual(['Save', 'Close file'])
  })

  it('should show only the commands, with no caption or divider, when there is no other recent file', () => {
    // Act
    const menu = fileMenu([], 'Recent files', commands)

    // Assert
    expect(menu.actions.map((item) => item.label)).toEqual(['Save', 'Close file'])
    expect(menu.options).toEqual({})
  })
})
