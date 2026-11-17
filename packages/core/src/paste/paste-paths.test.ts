import { describe, expect, it } from 'vitest'
import { fileUriPaths, pastedText, pathsText, shellQuote } from './paste-paths.ts'

describe('shellQuote', () => {
  it('should keep a path as is when the shell reads it as one word', () => {
    expect(shellQuote('/home/ana/acme/backend/src/main.ts')).toBe(
      '/home/ana/acme/backend/src/main.ts',
    )
    expect(shellQuote('~/shot_1-final@2x.png')).toBe('~/shot_1-final@2x.png')
  })

  it('should quote a path when it has spaces or shell characters', () => {
    expect(shellQuote('/home/ana/Pictures/shot one.png')).toBe("'/home/ana/Pictures/shot one.png'")
    expect(shellQuote('/home/ana/a&b(1).txt')).toBe("'/home/ana/a&b(1).txt'")
  })

  it('should close and reopen the quotes when the path has a single quote', () => {
    expect(shellQuote("/home/ana/ana's notes")).toBe(`'/home/ana/ana'\\''s notes'`)
  })
})

describe('pathsText', () => {
  it('should put a space after each path when several are dropped', () => {
    // Arrange
    const paths = ['/home/ana/shot one.png', '/home/ana/acme']

    // Act
    const text = pathsText(paths)

    // Assert
    expect(text).toBe("'/home/ana/shot one.png' /home/ana/acme ")
  })
})

describe('fileUriPaths', () => {
  it('should decode the local paths when the list holds file links', () => {
    const list = '# copied\r\nfile:///home/ana/shot%20one.png\r\nfile://localhost/home/ana/acme\r\n'

    expect(fileUriPaths(list)).toEqual(['/home/ana/shot one.png', '/home/ana/acme'])
  })

  it('should give nothing when an entry is a web link or another host', () => {
    expect(fileUriPaths('https://example.com/a.png')).toEqual([])
    expect(fileUriPaths('file:///home/ana/a.png\nhttps://example.com')).toEqual([])
    expect(fileUriPaths('file://server/share/a.png')).toEqual([])
    expect(fileUriPaths('')).toEqual([])
  })

  it('should give nothing when an entry is badly encoded', () => {
    expect(fileUriPaths('file:///home/ana/%E0%A4%A')).toEqual([])
  })
})

describe('pastedText', () => {
  it('should paste the paths when files were copied in a file manager', () => {
    const text = pastedText({ uriList: 'file:///home/ana/shot%20one.png', text: '' })

    expect(text).toBe("'/home/ana/shot one.png' ")
  })

  it('should paste the text when the clipboard holds no local files', () => {
    expect(pastedText({ uriList: '', text: 'git status' })).toBe('git status')
    expect(pastedText({ uriList: 'https://example.com', text: 'https://example.com' })).toBe(
      'https://example.com',
    )
  })
})
