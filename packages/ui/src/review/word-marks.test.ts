import { describe, expect, it } from 'vitest'
import { wordMarks } from './word-marks.ts'

const marked = (text: string, marks: readonly { start: number; end: number }[]) =>
  marks.map((mark) => text.slice(mark.start, mark.end))

describe('wordMarks', () => {
  it('should mark only the word that changed when the rest of the line is the same', () => {
    const removed = '  const timeout = 3000'
    const added = '  const timeout = 5000'

    const marks = wordMarks(removed, added)

    expect(marked(removed, marks.removed)).toEqual(['3000'])
    expect(marked(added, marks.added)).toEqual(['5000'])
  })

  it('should mark an inserted word only on the added side when nothing was removed', () => {
    const marks = wordMarks('return value', 'return await value')

    expect(marks.removed).toEqual([])
    expect(marked('return await value', marks.added)).toEqual(['await '])
  })

  it('should mark a change of whitespace when only the spaces differ', () => {
    const marks = wordMarks('a = 1', 'a  = 1')

    expect(marks.added.length).toBeGreaterThan(0)
  })

  it('should mark nothing when the lines share too little to compare', () => {
    expect(wordMarks('import { a } from "x"', 'export default class Widget {}')).toEqual({
      removed: [],
      added: [],
    })
  })

  it('should mark nothing when a line is too long to compare cheaply', () => {
    const long = 'x'.repeat(1001)

    expect(wordMarks(long, `${long}y`)).toEqual({ removed: [], added: [] })
  })
})
