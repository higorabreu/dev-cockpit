import type { ViewItem } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createSeenMarks } from './seen-marks.ts'

const item = (number: number, updatedAt = '2026-11-11T10:00:00Z'): ViewItem => ({
  kind: 'mergeRequest',
  id: `acme/backend!${number}`,
  number,
  title: `Merge request ${number}`,
  url: `https://gitlab.example.com/acme/backend/-/merge_requests/${number}`,
  project: 'acme/backend',
  author: 'ana',
  sourceBranch: `feat/item-${number}`,
  targetBranch: 'main',
  draft: false,
  updatedAt,
  hasConflicts: false,
  openDiscussions: true,
  pipeline: 'success',
})

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [['dck-seen-v1', initial]])
  let writes = 0
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes += 1
      values.set(key, value)
    },
    stored: () => JSON.parse(values.get('dck-seen-v1') ?? 'null') as unknown,
    writes: () => writes,
  }
}

describe('createSeenMarks', () => {
  it('should store the version of each listed item when the list is seen', () => {
    const storage = memoryStorage()
    const marks = createSeenMarks(storage)

    marks.see('mine', [item(1), item(2, '2026-11-12T08:00:00Z')])

    expect(storage.stored()).toEqual({
      mine: { 'acme/backend!1': '2026-11-11T10:00:00Z', 'acme/backend!2': '2026-11-12T08:00:00Z' },
    })
  })

  it('should read the marks back when created again over the same storage', () => {
    const storage = memoryStorage()
    createSeenMarks(storage).see('mine', [item(1)])

    const marks = createSeenMarks(storage)

    expect(marks.of('mine')).toEqual({ 'acme/backend!1': '2026-11-11T10:00:00Z' })
  })

  it('should drop the marks of items no longer listed when a fresh list arrives', () => {
    const storage = memoryStorage()
    const marks = createSeenMarks(storage)
    marks.see('mine', [item(1), item(2)])

    marks.keep('mine', [item(2), item(3)])

    expect(marks.of('mine')).toEqual({ 'acme/backend!2': '2026-11-11T10:00:00Z' })
  })

  it('should write nothing when the same list is seen again', () => {
    const storage = memoryStorage()
    const marks = createSeenMarks(storage)
    marks.see('mine', [item(1)])

    const changed = marks.see('mine', [item(1)])

    expect(changed).toBe(false)
    expect(storage.writes()).toBe(1)
  })

  it('should start empty when the stored marks are not valid', () => {
    const marks = createSeenMarks(memoryStorage('{"mine": 3}'))

    expect(marks.of('mine')).toEqual({})
  })

  it('should keep the marks for the run when the storage cannot be written', () => {
    const marks = createSeenMarks({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    })

    marks.see('mine', [item(1)])

    expect(marks.of('mine')).toEqual({ 'acme/backend!1': '2026-11-11T10:00:00Z' })
  })
})
