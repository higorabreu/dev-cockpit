import { describe, expect, it } from 'vitest'
import type { DiffFile } from './diff.ts'
import { hashText, patchKey } from './patch-key.ts'

const file = (text: string, extra: Partial<DiffFile> = {}): DiffFile => ({
  path: 'src/main.ts',
  oldPath: undefined,
  status: 'modified',
  oldMode: undefined,
  newMode: undefined,
  binary: false,
  nonUtf8: false,
  submodule: false,
  crlf: false,
  generated: false,
  untracked: false,
  additions: 1,
  deletions: 1,
  hunks: [
    {
      oldStart: 1,
      oldCount: 1,
      newStart: 1,
      newCount: 1,
      section: '',
      lines: [
        { kind: 'remove', text: 'old', old: 1, new: undefined },
        { kind: 'add', text, old: undefined, new: 1 },
      ],
    },
  ],
  ...extra,
})

describe('hashText', () => {
  it('should give the same eight hex digits for the same text and others for another', () => {
    expect(hashText('abc')).toMatch(/^[0-9a-f]{8}$/)
    expect(hashText('abc')).toBe(hashText('abc'))
    expect(hashText('abc')).not.toBe(hashText('abd'))
    expect(hashText('')).toBe('811c9dc5')
  })
})

describe('patchKey', () => {
  it('should keep the key when the file has the same change', () => {
    expect(patchKey(file('new'))).toBe(patchKey(file('new')))
  })

  it('should give another key when a line of the change differs', () => {
    expect(patchKey(file('new'))).not.toBe(patchKey(file('newer')))
  })

  it('should give another key when only the mode or the size changes', () => {
    const base = patchKey(file('new'))

    expect(patchKey(file('new', { oldMode: '100644', newMode: '100755' }))).not.toBe(base)
    expect(patchKey(file('new', { size: 10 }))).not.toBe(base)
  })

  it('should start with the path, so two files with the same lines keep apart', () => {
    expect(patchKey(file('new')).startsWith('src/main.ts\n')).toBe(true)
    expect(patchKey(file('new', { path: 'src/other.ts' }))).not.toBe(patchKey(file('new')))
  })
})
