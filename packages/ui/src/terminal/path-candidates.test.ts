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
