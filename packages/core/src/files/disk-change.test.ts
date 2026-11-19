import { describe, expect, it } from 'vitest'
import type { FileStamp } from '../ports/file-store.ts'
import { changeStep, type DiskText, sameContent, saveStep, settleDiskText } from './disk-change.ts'

const stamp = (hash: string, size = 10, mtimeMs = 1): FileStamp => ({ size, mtimeMs, hash })

const lines = (text: string) =>
  text
    .split(' ')
    .map((word) => `${word}\n`)
    .join('')

const BASE = lines('a b c d e f g h i j')

function settle(change: Partial<DiskText>) {
  return settleDiskText({
    base: { text: BASE, encoding: 'utf-8' },
    mine: BASE,
    disk: { text: BASE, encoding: 'utf-8' },
    autoMerge: true,
    ...change,
  })
}

describe('saveStep', () => {
  it('should write when the disk holds the base even if only its time moved', () => {
    expect(saveStep(stamp('x', 10, 1), stamp('x', 10, 99))).toBe('write')
  })

  it('should refuse when the disk holds other bytes or no file', () => {
    expect(saveStep(stamp('x'), stamp('y'))).toBe('conflict')
    expect(saveStep(stamp('x', 10), stamp('x', 11))).toBe('conflict')
    expect(saveStep(stamp('x'), undefined)).toBe('conflict')
  })

  it('should write a file that must not exist only when there is none', () => {
    expect(saveStep(null, undefined)).toBe('write')
    expect(saveStep(null, stamp('x'))).toBe('conflict')
  })

  it('should compare size and hash but not the time when telling content apart', () => {
    expect(sameContent(stamp('x', 3, 1), stamp('x', 3, 2))).toBe(true)
  })
})

describe('changeStep', () => {
  it('should ignore a change that brings the base back, as the cockpit own save does', () => {
    expect(changeStep(stamp('x'), { kind: 'changed', stamp: stamp('x', 10, 5) })).toBe('ignore')
  })

  it('should read the disk when its content changed and say so when the file is gone', () => {
    expect(changeStep(stamp('x'), { kind: 'changed', stamp: stamp('y') })).toBe('read')
    expect(changeStep(stamp('x'), { kind: 'deleted' })).toBe('deleted')
  })
})

describe('settleDiskText', () => {
  it('should reload when the user has no edits', () => {
    const outcome = settle({ disk: { text: lines('A b c'), encoding: 'utf-8' } })

    expect(outcome).toEqual({ kind: 'reload' })
  })

  it('should reload when the user already typed what the disk holds', () => {
    const typed = lines('a b c d e f g h i J')

    expect(settle({ mine: typed, disk: { text: typed, encoding: 'utf-8' } })).toEqual({
      kind: 'reload',
    })
  })

  it('should merge the disk changes into the user edits when they are apart', () => {
    // Act
    const outcome = settle({
      mine: lines('A b c d e f g h i j'),
      disk: { text: lines('a b c d e f g h i J'), encoding: 'utf-8' },
    })

    // Assert
    expect(outcome).toMatchObject({
      kind: 'merged',
      text: lines('A b c d e f g h i J'),
      fromDisk: [{ from: 9, to: 10 }],
    })
  })

  it('should give a conflict when both changed the same line', () => {
    const outcome = settle({
      mine: lines('A b c d e f g h i j'),
      disk: { text: lines('X b c d e f g h i j'), encoding: 'utf-8' },
    })

    expect(outcome).toEqual({ kind: 'conflict', reason: 'same-lines' })
  })

  it('should give a conflict instead of merging when merging by itself is off', () => {
    const outcome = settle({
      mine: lines('A b c d e f g h i j'),
      disk: { text: lines('a b c d e f g h i J'), encoding: 'utf-8' },
      autoMerge: false,
    })

    expect(outcome).toEqual({ kind: 'conflict', reason: 'merge-off' })
  })

  it('should give a conflict when the disk changed the line endings', () => {
    const outcome = settle({
      mine: lines('A b c d e f g h i j'),
      disk: { text: BASE.replaceAll('\n', '\r\n'), encoding: 'utf-8' },
    })

    expect(outcome).toEqual({ kind: 'conflict', reason: 'line-endings' })
  })

  it('should give a conflict when the disk changed the encoding', () => {
    const outcome = settle({
      mine: lines('A b c d e f g h i j'),
      disk: { text: lines('a b c d e f g h i J'), encoding: 'utf-8-bom' },
    })

    expect(outcome).toEqual({ kind: 'conflict', reason: 'encoding' })
  })

  it('should give a conflict when the disk file is no longer text', () => {
    expect(settle({ mine: lines('A'), disk: undefined })).toEqual({
      kind: 'conflict',
      reason: 'not-text',
    })
  })

  it('should give a conflict when a formatter rewrote most of the file', () => {
    const outcome = settle({
      mine: lines('a b c d e f g h i J'),
      disk: { text: lines('A B C D e f g h i j'), encoding: 'utf-8' },
    })

    expect(outcome).toEqual({ kind: 'conflict', reason: 'many-lines' })
  })
})
