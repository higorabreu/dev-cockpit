import { describe, expect, it } from 'vitest'
import { changedSpan, guessIndent } from './line-span.ts'

describe('changedSpan', () => {
  it('should find the lines between the shared start and end when one line changed', () => {
    expect(changedSpan(['a', 'b', 'c'], ['a', 'B', 'c'])).toEqual({
      start: 1,
      endBefore: 2,
      endAfter: 2,
    })
  })

  it('should give an empty old span when lines were only added', () => {
    expect(changedSpan(['a', 'c'], ['a', 'b', 'c'])).toEqual({
      start: 1,
      endBefore: 1,
      endAfter: 2,
    })
  })

  it('should not cross its own start when the same line repeats', () => {
    expect(changedSpan(['x', 'x'], ['x', 'x', 'x'])).toEqual({
      start: 2,
      endBefore: 2,
      endAfter: 3,
    })
  })
})

describe('guessIndent', () => {
  it('should take a tab when the indented lines start with one', () => {
    expect(guessIndent('func main() {\n\tfmt.Println(1)\n}\n')).toBe('\t')
  })

  it('should take the smallest step of spaces when the lines use spaces', () => {
    expect(guessIndent('def a():\n    if x:\n        pass\n')).toBe('    ')
  })

  it('should take two spaces when no line is indented', () => {
    expect(guessIndent('one\ntwo\n')).toBe('  ')
  })
})
