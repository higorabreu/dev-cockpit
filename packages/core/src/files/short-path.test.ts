import { describe, expect, it } from 'vitest'
import { pathPieces, shortPath } from './short-path.ts'

describe('shortPath', () => {
  it('should start from the repository folder name when the file is inside the repository', () => {
    expect(shortPath('/home/ana/acme-api/src/auth/login.ts', '/home/ana/acme-api')).toBe(
      'acme-api/src/auth/login.ts',
    )
  })

  it('should keep the submodule folder in the path when the file is inside a submodule', () => {
    expect(shortPath('/home/ana/acme/vendor/ui-kit/src/button.ts', '/home/ana/acme')).toBe(
      'acme/vendor/ui-kit/src/button.ts',
    )
  })

  it('should abbreviate the home when the file is outside the repository', () => {
    expect(shortPath('/home/ana/notes/todo.md', '/home/ana/acme-api')).toBe('~/notes/todo.md')
    expect(shortPath('/Users/ana/notes/todo.md', undefined)).toBe('~/notes/todo.md')
  })

  it('should keep the whole path when the file is neither in the repository nor in the home', () => {
    expect(shortPath('/etc/hosts', '/home/ana/acme')).toBe('/etc/hosts')
  })

  it('should not take a sibling folder for the repository when its name starts the same', () => {
    expect(shortPath('/home/ana/acme-web/index.ts', '/home/ana/acme')).toBe('~/acme-web/index.ts')
  })

  it('should ignore a trailing separator when the root ends with one', () => {
    expect(shortPath('/home/ana/acme/a.ts', '/home/ana/acme/')).toBe('acme/a.ts')
  })

  it('should keep the backslashes and ignore the case when the paths are Windows-like', () => {
    expect(shortPath('C:\\Users\\ana\\acme\\src\\a.ts', 'c:\\users\\ana\\acme')).toBe(
      'acme\\src\\a.ts',
    )
    expect(shortPath('C:\\Users\\ana\\notes\\b.md', 'C:\\work\\acme')).toBe('~\\notes\\b.md')
    expect(shortPath('D:\\data\\c.json', undefined)).toBe('D:\\data\\c.json')
  })
})

describe('pathPieces', () => {
  it('should give the folders and the name when the path is short', () => {
    expect(pathPieces('acme/src/a.ts')).toEqual({
      folders: ['acme', 'src'],
      name: 'a.ts',
      separator: '/',
    })
  })

  it('should start with an empty folder when the path is absolute', () => {
    expect(pathPieces('/etc/hosts').folders).toEqual(['', 'etc'])
  })

  it('should keep the separator when the path is Windows-like', () => {
    expect(pathPieces('~\\notes\\b.md')).toEqual({
      folders: ['~', 'notes'],
      name: 'b.md',
      separator: '\\',
    })
  })
})
