import { describe, expect, it } from 'vitest'
import { forgetFile, MAX_RECENT_FILES, recentEntries, rememberFile } from './recent-files.ts'

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

describe('recentEntries', () => {
  const root = '/home/ana/acme'

  it('should give only the name when no other recent file shares it', () => {
    expect(recentEntries(['/home/ana/acme/src/a.ts', '/home/ana/acme/b.ts'], root)).toEqual([
      { path: '/home/ana/acme/src/a.ts', name: 'a.ts' },
      { path: '/home/ana/acme/b.ts', name: 'b.ts' },
    ])
  })

  it('should add the nearest folder when it tells two files of one name apart', () => {
    const entries = recentEntries(
      ['/home/ana/acme/api/settings.json', '/home/ana/acme/web/settings.json'],
      root,
    )

    expect(entries.map((entry) => entry.folder)).toEqual(['api', 'web'])
  })

  it('should add as many folders as it takes when the nearest ones are the same', () => {
    const entries = recentEntries(
      ['/home/ana/acme/api/src/index.ts', '/home/ana/acme/web/src/index.ts', '/home/ana/x.md'],
      root,
    )

    expect(entries.map((entry) => entry.folder)).toEqual(['api/src', 'web/src', undefined])
  })

  it('should write the folders from the short path when one file is outside the repository', () => {
    const entries = recentEntries(
      ['/home/ana/acme/.vscode/settings.json', '/home/ana/.config/Code/User/settings.json'],
      root,
    )

    expect(entries.map((entry) => entry.folder)).toEqual(['.vscode', 'User'])
  })

  it('should show the leading separator when the whole absolute folder is needed', () => {
    const entries = recentEntries(['/home/ana/acme/etc/hosts', '/etc/hosts'], root)

    expect(entries.map((entry) => entry.folder)).toEqual(['acme/etc', '/etc'])
  })

  it('should keep the backslashes when the paths are Windows-like', () => {
    const entries = recentEntries(
      ['C:\\work\\acme\\api\\app.json', 'C:\\work\\acme\\web\\app.json'],
      'C:\\work\\acme',
    )

    expect(entries.map((entry) => entry.folder)).toEqual(['api', 'web'])
  })
})
