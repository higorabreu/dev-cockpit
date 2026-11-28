import { describe, expect, it } from 'vitest'
import { createDirectoryReader, directoryOfReport } from './directory-reports.ts'

const report = (url: string, end = '\x07') => `\x1b]7;${url}${end}`

describe('directoryOfReport', () => {
  it.each([
    {
      from: 'PowerShell',
      url: 'file://PC/C%3A/Users/ana/my%20projects',
      expected: 'C:\\Users\\ana\\my projects',
    },
    { from: 'cmd', url: 'file://localhost/C:\\Users\\ana\\acme', expected: 'C:\\Users\\ana\\acme' },
    { from: 'Git Bash', url: 'file://PC/c/Users/ana/acme', expected: 'C:\\Users\\ana\\acme' },
    { from: 'a drive root', url: 'file://PC/D:/', expected: 'D:\\' },
    { from: 'Git Bash at a drive root', url: 'file://PC/d', expected: 'D:\\' },
    {
      from: 'a raw path with a percent sign',
      url: 'file://PC/c/Users/ana/100%',
      expected: 'C:\\Users\\ana\\100%',
    },
  ])('should read the Windows folder when $from reports it', ({ url, expected }) => {
    expect(directoryOfReport(url, 'win32')).toBe(expected)
  })

  it('should leave out a folder with no drive when Git Bash is in its own /usr', () => {
    expect(directoryOfReport('file://PC/usr/bin', 'win32')).toBeUndefined()
    expect(directoryOfReport('file://PC/server/share', 'win32')).toBeUndefined()
  })

  it('should keep the path as it is when the system is not Windows', () => {
    expect(directoryOfReport('file://ana-laptop/home/ana/a%C3%A7%C3%A3o', 'posix')).toBe(
      '/home/ana/ação',
    )
  })

  it('should read nothing when the report is not a file URL', () => {
    expect(directoryOfReport('http://example.com/x', 'win32')).toBeUndefined()
    expect(directoryOfReport('file://PC', 'win32')).toBeUndefined()
  })
})

describe('createDirectoryReader', () => {
  it('should give the last folder when a chunk reports several among other output', () => {
    // Arrange
    const reader = createDirectoryReader('win32')

    // Act
    const directory = reader.feed(
      `${report('file://PC/C:/a')}PS C:\\a> cd b\r\n${report('file://PC/C:/a/b', '\x1b\\')}PS C:\\a\\b> `,
    )

    // Assert
    expect(directory).toBe('C:\\a\\b')
  })

  it('should read a report cut between two chunks when the second one ends it', () => {
    // Arrange
    const reader = createDirectoryReader('win32')
    const whole = `output${report('file://PC/C:/Users/ana')}PS> `

    // Act
    const results = [3, 8, 20].map((cut) => {
      const fresh = createDirectoryReader('win32')
      return [fresh.feed(whole.slice(0, cut)), fresh.feed(whole.slice(cut))]
    })

    // Assert
    expect(results).toEqual([
      [undefined, 'C:\\Users\\ana'],
      [undefined, 'C:\\Users\\ana'],
      [undefined, 'C:\\Users\\ana'],
    ])
    expect(reader.feed('plain output')).toBeUndefined()
  })

  it('should drop a start that never ends when the output runs past a report length', () => {
    // Arrange
    const reader = createDirectoryReader('win32')

    // Act
    reader.feed(`\x1b]7;file://PC/C:/${'x'.repeat(5000)}`)
    const directory = reader.feed(`\x07${report('file://PC/C:/b')}`)

    // Assert
    expect(directory).toBe('C:\\b')
  })
})
