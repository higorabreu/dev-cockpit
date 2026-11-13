import type { ViewItem } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { HEADER_HEIGHT, layOutList, ROW_HEIGHT, rowSpan } from './list-layout.ts'

const task = (key: string): ViewItem => ({
  kind: 'issue',
  id: key,
  key,
  summary: `Task ${key}`,
  url: `https://acme.atlassian.net/browse/${key}`,
  project: 'NTF',
  type: 'Story',
  status: 'To Do',
  statusCategory: 'todo',
  updatedAt: '2026-11-11T10:00:00Z',
})

describe('layOutList', () => {
  it('should place a header above the rows of each titled section and number the rows across them', () => {
    const layout = layOutList([
      { category: 'progress', items: [task('NTF-1')] },
      { category: 'todo', items: [task('NTF-2'), task('NTF-3')] },
    ])

    expect(layout.entries).toEqual([
      { kind: 'header', section: 0, top: 0 },
      { kind: 'row', index: 0, section: 0, top: HEADER_HEIGHT },
      { kind: 'header', section: 1, top: HEADER_HEIGHT + ROW_HEIGHT },
      { kind: 'row', index: 1, section: 1, top: 2 * HEADER_HEIGHT + ROW_HEIGHT },
      { kind: 'row', index: 2, section: 1, top: 2 * HEADER_HEIGHT + 2 * ROW_HEIGHT },
    ])
    expect(layout.items.map((item) => item.id)).toEqual(['NTF-1', 'NTF-2', 'NTF-3'])
    expect(layout.height).toBe(2 * HEADER_HEIGHT + 3 * ROW_HEIGHT)
  })

  it('should draw rows alone when the list has no sections', () => {
    const layout = layOutList([{ category: undefined, items: [task('NTF-1'), task('NTF-2')] }])

    expect(layout.tops).toEqual([0, ROW_HEIGHT])
  })
})

describe('rowSpan', () => {
  const layout = layOutList([
    { category: 'progress', items: [task('NTF-1')] },
    { category: 'todo', items: [task('NTF-2'), task('NTF-3')] },
  ])

  it('should bring the header into view with the first row of a section', () => {
    expect(rowSpan(layout, 1)).toEqual({
      top: HEADER_HEIGHT + ROW_HEIGHT,
      bottom: 2 * HEADER_HEIGHT + 2 * ROW_HEIGHT,
    })
  })

  it('should cover only the row when it is not the first of its section', () => {
    expect(rowSpan(layout, 2)).toEqual({
      top: 2 * HEADER_HEIGHT + 2 * ROW_HEIGHT,
      bottom: 2 * HEADER_HEIGHT + 3 * ROW_HEIGHT,
    })
  })
})
