import { splitLines } from './line-diff.ts'
import type { TextEdit } from './merge.ts'

// A merge edit by lines of the user's text: lines [fromLine, toLine), from 0, become `insert`
export interface LineEdit {
  readonly fromLine: number
  readonly toLine: number
  readonly insert: string
}

// The merge counts a CRLF as two characters and an editor as one line break, so its edits, which start
// and end at line starts, travel as line numbers
export function editsByLine(mine: string, edits: readonly TextEdit[]): LineEdit[] {
  const starts = new Map<number, number>([[0, 0]])
  let line = 0
  for (let index = mine.indexOf('\n'); index >= 0; index = mine.indexOf('\n', index + 1))
    starts.set(index + 1, ++line)
  const total = splitLines(mine).length
  const lineAt = (offset: number) => {
    const found = offset === mine.length ? total : starts.get(offset)
    if (found === undefined) throw new Error('invariant: a merge edit starts and ends at a line')
    return found
  }
  return edits.map((edit) => ({
    fromLine: lineAt(edit.from),
    toLine: lineAt(edit.to),
    insert: edit.insert,
  }))
}
