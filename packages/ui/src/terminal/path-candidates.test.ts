import { describe, expect, it } from 'vitest'
import { findPathCandidates } from './path-candidates.ts'

const paths = (text: string) => findPathCandidates(text).map((candidate) => candidate.path)
const linked = (text: string) =>
  findPathCandidates(text).map((candidate) => text.slice(candidate.start, candidate.end))

describe('findPathCandidates', () => {
  it('should find an absolute path when a line prints one', () => {
    expect(paths('wrote /home/ana/acme/backend/src/app.ts')).toEqual([
      '/home/ana/acme/backend/src/app.ts',
    ])
  })

  it('should find a home path when it starts with a tilde and a slash', () => {
    expect(paths('see ~/acme/notes.md and ~ana/x')).toEqual(['~/acme/notes.md'])
  })

  it.each([
    ['a slash', 'packages/ui', 'packages/ui'],
    ['an extension', 'app.ts', 'app.ts'],
    ['a dot slash', './build', './build'],
    ['a parent folder', '../backend', '../backend'],
    ['a hidden file with an extension', '.env.local', '.env.local'],
  ])('should find a relative path when it has %s', (_label, text, expected) => {
    expect(paths(`  ${text}  `)).toEqual([expected])
  })

  it('should drop a line and column for opening but keep them in the link when they follow the path', () => {
    const text = 'src/app.ts:12:3 error and src/x.ts:7 warning'

    expect(paths(text)).toEqual(['src/app.ts', 'src/x.ts'])
    expect(linked(text)).toEqual(['src/app.ts:12:3', 'src/x.ts:7'])
  })

  it('should find the path inside parentheses when an agent prints a tool call', () => {
    const text = '● Update(packages/ui/src/app.ts)'

    expect(paths(text)).toEqual(['packages/ui/src/app.ts'])
    expect(linked(text)).toEqual(['packages/ui/src/app.ts'])
  })

  it.each([
    ['double quotes', '"src/x.ts"'],
    ['single quotes', "'src/x.ts'"],
    ['backticks', '`src/x.ts`'],
    ['brackets', '[src/x.ts]'],
    ['angle brackets', '<src/x.ts>'],
  ])('should find the path inside %s', (_label, text) => {
    expect(paths(`open ${text} now`)).toEqual(['src/x.ts'])
  })

  it('should leave out the punctuation that ends a sentence when a path closes it', () => {
    expect(linked('Saved to src/app.ts. Done, see ./out!')).toEqual(['src/app.ts', './out'])
  })

  it('should split paths joined by a colon when the line is a search path', () => {
    expect(paths('PATH=/usr/local/bin:/usr/bin')).toEqual(['/usr/local/bin', '/usr/bin'])
  })

  it('should ignore everything inside an address when the line has a URL', () => {
    const text = 'open https://example.com/docs/app.ts or file:///home/ana/x.ts then src/y.ts'

    expect(paths(text)).toEqual(['src/y.ts'])
  })

  it.each([
    ['plain words', 'build finished without errors'],
    ['a number with a dot', 'version 1.5 and v2.0'],
    ['a clock time', 'at 12:30:01'],
    ['a lone slash', 'cd / now'],
    ['dots only', 'cd .. and ...'],
    ['an ellipsis ending a word', 'loading...'],
  ])('should find nothing when the line has %s', (_label, text) => {
    expect(paths(text)).toEqual([])
  })

  it('should give the position of each path in the line when it finds several', () => {
    expect(findPathCandidates('a.ts b/c')).toEqual([
      { path: 'a.ts', start: 0, end: 4 },
      { path: 'b/c', start: 5, end: 8 },
    ])
  })
})

const placeOf = (text: string) =>
  findPathCandidates(text).map(({ path, line, column }) => ({ path, line, column }))

describe('findPathCandidates places', () => {
  it.each([
    ['gcc and clang', 'src/main.c:12:5: error: expected ;', 'src/main.c', 12, 5],
    ['go build', './cmd/api/main.go:12:5: undefined: x', './cmd/api/main.go', 12, 5],
    ['go test', '    handler_test.go:42: got 1, want 2', 'handler_test.go', 42, undefined],
    ['rustc', '  --> src/main.rs:12:5', 'src/main.rs', 12, 5],
    ['tsc --pretty', 'src/app.ts:12:5 - error TS2322: Type', 'src/app.ts', 12, 5],
    ['tsc', 'src/app.ts(12,5): error TS2322: Type', 'src/app.ts', 12, 5],
    ['MSBuild with a line only', 'Program.cs(7): warning CS0168', 'Program.cs', 7, undefined],
    ['vitest', ' ❯ src/app.test.ts:12:5', 'src/app.test.ts', 12, 5],
    ['a stack trace', '    at run (src/app.ts:30:11)', 'src/app.ts', 30, 11],
    ['pytest', 'tests/test_app.py:12: AssertionError', 'tests/test_app.py', 12, undefined],
    [
      "Python's traceback",
      '  File "/home/ana/acme/app.py", line 12, in main',
      '/home/ana/acme/app.py',
      12,
      undefined,
    ],
    [
      "ESLint's compact format",
      '/home/ana/acme/src/app.ts: line 12, col 5, Error - no-unused-vars',
      '/home/ana/acme/src/app.ts',
      12,
      5,
    ],
    ['no place', 'wrote src/app.ts', 'src/app.ts', undefined, undefined],
  ])('should read the line and column when %s prints them', (_tool, text, path, line, column) => {
    expect(placeOf(text)).toEqual([{ path, line, column }])
  })

  it('should keep the parentheses in the link when tsc writes the place in them', () => {
    expect(linked('src/app.ts(12,5): error')).toEqual(['src/app.ts(12,5)'])
  })

  it('should read the drive letter as part of the path when a Windows path has a place', () => {
    expect(placeOf('C:\\work\\acme\\app.ts:12:5: error')).toEqual([
      { path: 'C:\\work\\acme\\app.ts', line: 12, column: 5 },
    ])
    expect(placeOf('D:/work/app.ts(3,1): error')).toEqual([
      { path: 'D:/work/app.ts', line: 3, column: 1 },
    ])
  })

  it('should not take a drive letter from the middle of a word when a colon follows it', () => {
    expect(paths('PATH=/usr/local/bin:/usr/bin and ab:/x')).toEqual([
      '/usr/local/bin',
      '/usr/bin',
      '/x',
    ])
  })

  it('should keep a folder written in parentheses or brackets when a route names one', () => {
    expect(placeOf('app/(auth)/[id]/page.tsx:8:3')).toEqual([
      { path: 'app/(auth)/[id]/page.tsx', line: 8, column: 3 },
    ])
  })

  it('should find a path with spaces when it is quoted', () => {
    const text = '  File "/home/ana/my project/app.py", line 4, in run'

    expect(placeOf(text)).toEqual([
      { path: '/home/ana/my project/app.py', line: 4, column: undefined },
    ])
    expect(linked(text)).toEqual(['/home/ana/my project/app.py'])
  })

  it('should pass an apostrophe over when a quoted path with spaces comes after it', () => {
    expect(paths("don't open 'notes/to do.md' now")).toEqual(['notes/to do.md'])
  })

  it('should leave a line number of zero out when a tool prints one', () => {
    expect(placeOf('src/app.ts:0:0')).toEqual([
      { path: 'src/app.ts', line: undefined, column: undefined },
    ])
  })
})
