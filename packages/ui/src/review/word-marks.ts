import { diffWordsWithSpace } from 'diff'

// A changed stretch of a line, [start, end) in characters
export interface Mark {
  readonly start: number
  readonly end: number
}

export interface LineMarks {
  readonly removed: readonly Mark[]
  readonly added: readonly Mark[]
}

// Past this the comparison costs more than the marks help
const MAX_LENGTH = 1000
// Below this share of unchanged text the whole line changed, and marking every word would only be noise
const MIN_KEPT = 0.35

const NONE: LineMarks = { removed: [], added: [] }

// Compares a removed line with the added line that replaced it, word by word, whitespace included
export function wordMarks(removed: string, added: string): LineMarks {
  if (removed === added || removed.length > MAX_LENGTH || added.length > MAX_LENGTH) return NONE
  const removedMarks: Mark[] = []
  const addedMarks: Mark[] = []
  let before = 0
  let after = 0
  let kept = 0
  for (const part of diffWordsWithSpace(removed, added)) {
    const length = part.value.length
    if (part.removed) {
      removedMarks.push({ start: before, end: before + length })
      before += length
    } else if (part.added) {
      addedMarks.push({ start: after, end: after + length })
      after += length
    } else {
      kept += length
      before += length
      after += length
    }
  }
  if (kept / Math.max(removed.length, added.length) < MIN_KEPT) return NONE
  return { removed: removedMarks, added: addedMarks }
}
