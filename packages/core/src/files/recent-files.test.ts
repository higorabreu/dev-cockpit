import { describe, expect, it } from 'vitest'
import { forgetFile, MAX_RECENT_FILES, rememberFile } from './recent-files.ts'

describe('recent files', () => {
  it('should put the opened file first once and keep only the newest ones', () => {
    // Arrange
    let recent: readonly string[] = []

    // Act
    for (let index = 0; index < MAX_RECENT_FILES + 2; index++)
      recent = rememberFile(recent, `/home/ana/acme/${index}.ts`)
    recent = rememberFile(recent, '/home/ana/acme/5.ts')

    // Assert
    expect(MAX_RECENT_FILES).toBe(5)
    expect(recent).toHaveLength(MAX_RECENT_FILES)
    expect(recent.slice(0, 2)).toEqual(['/home/ana/acme/5.ts', '/home/ana/acme/6.ts'])
    expect(recent.filter((path) => path === '/home/ana/acme/5.ts')).toHaveLength(1)
  })

  it('should drop a file when it is forgotten', () => {
    expect(forgetFile(['/a/x.ts', '/a/y.ts'], '/a/x.ts')).toEqual(['/a/y.ts'])
  })
})
