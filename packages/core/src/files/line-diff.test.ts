import { describe, expect, it } from 'vitest'
import { diffLines, type Hunk, splitLines } from './line-diff.ts'

// A fixed sequence, so a failure always comes back the same
function random(seed: number) {
  let state = seed
  return (below: number) => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state % below
  }
}

const words = (text: string) => text.split(' ').filter(Boolean)

function apply(a: readonly string[], b: readonly string[], hunks: readonly Hunk[]) {
  const out: string[] = []
  let at = 0
  for (const hunk of hunks) {
    out.push(...a.slice(at, hunk.aStart), ...b.slice(hunk.bStart, hunk.bEnd))
    at = hunk.aEnd
  }
  return [...out, ...a.slice(at)]
}

// The fewest inserted plus deleted lines, by the longest common subsequence
function fewestEdits(a: readonly string[], b: readonly string[]) {
  const width = b.length + 1
  const table = new Array<number>((a.length + 1) * width).fill(0)
  const at = (i: number, j: number) => table[i * width + j] ?? 0
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
  return a.length + b.length - 2 * at(0, 0)
}

const edits = (hunks: readonly Hunk[]) =>
  hunks.reduce((sum, hunk) => sum + hunk.aEnd - hunk.aStart + hunk.bEnd - hunk.bStart, 0)

describe('splitLines', () => {
  it('should keep each line break with its line when the last line has none', () => {
    expect(splitLines('a\r\nb\n\nc')).toEqual(['a\r\n', 'b\n', '\n', 'c'])
  })

  it('should give no line when the text is empty', () => {
    expect(splitLines('')).toEqual([])
  })
})

describe('diffLines', () => {
  it('should find no change when both texts are equal', () => {
    expect(diffLines(words('a b c'), words('a b c'), 10)).toEqual([])
  })

  it('should give one hunk per changed region when lines change in two places', () => {
    // Arrange
    const a = words('a b c d e f')
    const b = words('a B c d e x f')

    // Act
    const hunks = diffLines(a, b, 10)

    // Assert
    expect(hunks).toEqual([
      { aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 },
      { aStart: 5, aEnd: 5, bStart: 5, bEnd: 6 },
    ])
  })

  it('should give up when more lines changed than the limit', () => {
    expect(diffLines(words('a b c d'), words('w x y z'), 7)).toBeUndefined()
    expect(diffLines(words('a b c d'), words('w x y z'), 8)).toHaveLength(1)
  })

  it('should rebuild the second text with the fewest edits when the texts are random', () => {
    // Arrange
    const next = random(7)
    const text = (length: number) => Array.from({ length }, () => 'abcd'[next(4)] ?? 'a')

    for (let round = 0; round < 300; round++) {
      const a = text(next(25))
      const b = text(next(25))

      // Act
      const hunks = diffLines(a, b, 100)

      // Assert
      expect(hunks).toBeDefined()
      expect(apply(a, b, hunks ?? [])).toEqual(b)
      expect(edits(hunks ?? [])).toBe(fewestEdits(a, b))
    }
  })

  it('should answer quickly when one line changed in a long file', () => {
    // Arrange
    const a = Array.from({ length: 200_000 }, (_, index) => `line ${index}\n`)
    const b = a.with(100_000, 'changed\n')
    const started = performance.now()

    // Act
    const hunks = diffLines(a, b, 2000)

    // Assert
    expect(hunks).toEqual([{ aStart: 100_000, aEnd: 100_001, bStart: 100_000, bEnd: 100_001 }])
    expect(performance.now() - started).toBeLessThan(500)
  })
})
