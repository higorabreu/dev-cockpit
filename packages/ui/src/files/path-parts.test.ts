import { describe, expect, it } from 'vitest'
import { fileName, pathParts, recentLabel } from './path-parts.ts'

describe('pathParts', () => {
  it('should start from the tab folder name when the file is inside it', () => {
    expect(pathParts('/home/ana/acme-api/src/auth/login.ts', '/home/ana/acme-api')).toEqual({
      folders: ['acme-api', 'src', 'auth'],
      name: 'login.ts',
    })
  })

  it('should abbreviate the home when the file is outside the tab folder', () => {
    expect(pathParts('/home/ana/notes/todo.md', '/home/ana/acme-api')).toEqual({
      folders: ['~', 'notes'],
      name: 'todo.md',
    })
  })

  it('should keep the root when the file is outside the home', () => {
    expect(pathParts('/etc/hosts', undefined)).toEqual({ folders: ['', 'etc'], name: 'hosts' })
  })
})

describe('recentLabel', () => {
  it('should add the parent folder when another recent file has the same name', () => {
    const recent = ['/home/ana/acme/api/index.ts', '/home/ana/acme/web/index.ts', '/home/ana/a.ts']

    expect(recentLabel(recent[0] ?? '', recent)).toBe('api/index.ts')
    expect(recentLabel(recent[2] ?? '', recent)).toBe('a.ts')
  })

  it('should give the last part of a path as its name', () => {
    expect(fileName('C:\\work\\acme\\login.ts')).toBe('login.ts')
  })
})
