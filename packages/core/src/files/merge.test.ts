import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { MERGE_LIMITS, type MergeOutcome, mergeThreeWay, type TextEdit } from './merge.ts'

const folder = mkdtempSync(join(tmpdir(), 'dck-merge-'))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

// The reference: `git merge-file -p mine base disk`, which exits with the number of conflicts
function gitMerge(base: string, mine: string, disk: string) {
  const [basePath, minePath, diskPath] = ['base', 'mine', 'disk'].map((name) => join(folder, name))
  writeFileSync(basePath ?? '', base)
  writeFileSync(minePath ?? '', mine)
  writeFileSync(diskPath ?? '', disk)
  try {
    const text = execFileSync(
      'git',
      ['merge-file', '-p', minePath ?? '', basePath ?? '', diskPath ?? ''],
      {
        encoding: 'utf8',
      },
    )
    return { clean: true, text }
  } catch {
    // A conflict makes git exit with a status above zero
    return { clean: false, text: '' }
  }
}

const lines = (text: string) =>
  text
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word}\n`)
    .join('')

function applyEdits(text: string, edits: readonly TextEdit[]) {
  let out = text
  for (const edit of [...edits].reverse())
    out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to)
  return out
}

function merged(outcome: MergeOutcome) {
  if (outcome.kind !== 'merged') throw new Error(`invariant: ${JSON.stringify(outcome)}`)
  return outcome
}

// Twelve lines, so the disk's share stays under the limit in every case below
const BASE = lines('a b c d e f g h i j k l')

const CASES: readonly [name: string, mine: string, disk: string, clean: boolean][] = [
  ['changes far apart', lines('A b c d e f g h i j k l'), lines('a b c d e f g h i J k l'), true],
  [
    'one equal line between',
    lines('A b c d e f g h i j k l'),
    lines('a b C d e f g h i j k l'),
    true,
  ],
  ['adjacent lines', lines('A b c d e f g h i j k l'), lines('a B c d e f g h i j k l'), false],
  ['the same line', lines('A b c d e f g h i j k l'), lines('X b c d e f g h i j k l'), false],
  ['the same change', lines('a b X c d e f g h i j k l'), lines('a b X c d e f g h i j k l'), true],
  [
    'an insertion after a changed line',
    lines('A b c d e f g h i j k l'),
    lines('a x b c d e f g h i j k l'),
    false,
  ],
  [
    'an insertion before a changed line',
    lines('a B c d e f g h i j k l'),
    lines('a x b c d e f g h i j k l'),
    false,
  ],
  [
    'insertions at the same place',
    lines('a x b c d e f g h i j k l'),
    lines('a y b c d e f g h i j k l'),
    false,
  ],
  [
    'insertions at the end',
    lines('a b c d e f g h i j k l x'),
    lines('a b c d e f g h i j k l y'),
    false,
  ],
  [
    'a deletion beside a change',
    lines('b c d e f g h i j k l'),
    lines('a B c d e f g h i j k l'),
    false,
  ],
  [
    'a deletion away from a change',
    lines('b c d e f g h i j k l'),
    lines('a b C d e f g h i j k l'),
    true,
  ],
  [
    'an insertion and a deletion apart',
    lines('a x b c d e f g h i j k l'),
    lines('a b c d e f g h i j k'),
    true,
  ],
  ['the user empties the file', '', lines('a b c d e f g h i j K l'), false],
  [
    'an overlap that agrees only in part',
    lines('A B c d e f g h i j k l'),
    lines('A b c d e f g h i j k l'),
    false,
  ],
]

describe('mergeThreeWay', () => {
  it.each(CASES)(
    'should merge as git merge-file does when the sides hold %s',
    (_name, mine, disk, clean) => {
      // Act
      const ours = mergeThreeWay(BASE, mine, disk)
      const git = gitMerge(BASE, mine, disk)

      // Assert
      expect(git.clean).toBe(clean)
      expect(ours.kind).toBe(clean ? 'merged' : 'conflict')
      if (ours.kind === 'merged') expect(ours.text).toBe(git.text)
    },
  )

  it('should merge as git does when the last line has no line break', () => {
    // Arrange
    const base = 'one\ntwo\nthree\nfour'
    const mine = 'ONE\ntwo\nthree\nfour'
    const disk = 'one\ntwo\nthree\nFOUR'

    // Act
    const ours = merged(mergeThreeWay(base, mine, disk))

    // Assert
    expect(ours.text).toBe('ONE\ntwo\nthree\nFOUR')
    expect(ours.text).toBe(gitMerge(base, mine, disk).text)
  })

  it('should keep carriage returns when the file uses CRLF', () => {
    // Arrange
    const base = 'a\r\nb\r\nc\r\nd\r\n'

    // Act
    const ours = merged(mergeThreeWay(base, 'A\r\nb\r\nc\r\nd\r\n', 'a\r\nb\r\nc\r\nD\r\n'))

    // Assert
    expect(ours.text).toBe('A\r\nb\r\nc\r\nD\r\n')
  })

  it('should give the disk changes as edits of the user text and the lines they fill when it merges', () => {
    // Arrange
    const mine = lines('a b c NEW d e f g h i j k l')
    const disk = lines('a b c d e f g h I1 I2 j k')

    // Act
    const ours = merged(mergeThreeWay(BASE, mine, disk))

    // Assert
    expect(ours.text).toBe(lines('a b c NEW d e f g h I1 I2 j k'))
    expect(applyEdits(mine, ours.edits)).toBe(ours.text)
    expect(ours.edits).toEqual([
      { from: 20, to: 22, insert: 'I1\nI2\n' },
      { from: 26, to: 28, insert: '' },
    ])
    expect(ours.fromDisk).toEqual([
      { from: 9, to: 11 },
      { from: 13, to: 13 },
    ])
  })

  it('should say the disk rewrote the file when it changed more than the share of lines', () => {
    // Arrange
    const disk = lines('A B C D e f g h i j k l')

    // Act
    const ours = mergeThreeWay(BASE, lines('a b c d e f g h i j k L'), disk)

    // Assert
    expect(MERGE_LIMITS.diskShare * 12).toBeLessThan(4)
    expect(ours).toEqual({ kind: 'conflict', reason: 'many-lines' })
  })

  it('should merge a small file when the disk changed up to the minimum of lines', () => {
    const ours = mergeThreeWay(lines('a b c d e'), lines('a b c d E'), lines('A B C d e'))

    expect(merged(ours).text).toBe(lines('A B C d E'))
  })

  it('should merge quickly when a long file changed at both ends', () => {
    // Arrange
    const base = Array.from({ length: 100_000 }, (_, index) => `line ${index}\n`)
    const mine = base.with(10, 'mine\n').join('')
    const disk = base.with(90_000, 'disk\n').join('')
    const started = performance.now()

    // Act
    const ours = merged(mergeThreeWay(base.join(''), mine, disk))

    // Assert
    expect(ours.fromDisk).toEqual([{ from: 90_000, to: 90_001 }])
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('should refuse to merge when the user changed more lines than the merge reads', () => {
    // Arrange
    const base = Array.from({ length: 10_000 }, (_, index) => `line ${index}\n`)
    const mine = base.map((line, index) => (index < 1500 ? `mine ${line}` : line)).join('')

    // Act
    const ours = mergeThreeWay(base.join(''), mine, base.with(9000, 'disk\n').join(''))

    // Assert
    expect(ours).toEqual({ kind: 'conflict', reason: 'many-lines' })
  })

  it('should agree with git on random edits when it merges, and never merge what git does not', () => {
    // Arrange
    let state = 11
    const next = (below: number) => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state % below
    }
    const base = Array.from({ length: 40 }, (_, index) => `line ${index}\n`)
    // A few edits of one or two lines each, as a person or an agent makes them
    const edit = (tag: string) => {
      const out = [...base]
      for (let count = next(3) + 1; count > 0; count--) {
        const at = next(out.length)
        const kind = next(3)
        if (kind === 0) out.splice(at, 1 + next(2), `${tag} ${at}\n`)
        else if (kind === 1) out.splice(at, 0, `${tag} new ${at}\n`)
        else out.splice(at, 1)
      }
      return out.join('')
    }
    let cleanBoth = 0

    for (let round = 0; round < 150; round++) {
      const mine = edit('mine')
      const disk = edit('disk')

      // Act
      const ours = mergeThreeWay(base.join(''), mine, disk)
      const git = gitMerge(base.join(''), mine, disk)

      // Assert
      if (ours.kind === 'merged') {
        expect(git).toEqual({ clean: true, text: ours.text })
        expect(applyEdits(mine, ours.edits)).toBe(ours.text)
        cleanBoth++
      }
      if (!git.clean) expect(ours.kind).toBe('conflict')
    }
    expect(cleanBoth).toBeGreaterThan(50)
  })
})
