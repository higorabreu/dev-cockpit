import type { DiffFile, DiffHunk, DiffLine } from './diff.ts'

// Where a comment's lines sit in its file's change: the hunk and the index of its first line
export interface CommentPlace {
  readonly hunk: number
  readonly start: number
}

// A comment the developer left on lines of the change, pending until it is sent to the agent
export interface ReviewComment {
  readonly id: string
  readonly path: string
  // Consecutive lines of one hunk, as the diff showed them when last found
  readonly lines: readonly DiffLine[]
  readonly body: string
  // Undefined while the lines are not in the change: the comment is outdated
  readonly place: CommentPlace | undefined
}

// The numbers a comment names: the new file's, or the old file's when every line was removed
export interface CommentSpan {
  readonly from: number
  readonly to: number
  readonly removed: boolean
}

export const isOutdated = (comment: ReviewComment) => comment.place === undefined

// The lines from one index to another of a hunk, in reading order whichever was picked first
export function hunkLines(hunk: DiffHunk, first: number, second: number): readonly DiffLine[] {
  const from = Math.max(0, Math.min(first, second))
  const to = Math.min(hunk.lines.length - 1, Math.max(first, second))
  return hunk.lines.slice(from, to + 1)
}

export function commentSpan(lines: readonly DiffLine[]): CommentSpan {
  const kept = lines.flatMap((line) => (line.new === undefined ? [] : [line.new]))
  if (kept.length > 0) return { from: kept[0] ?? 0, to: kept[kept.length - 1] ?? 0, removed: false }
  const old = lines.flatMap((line) => (line.old === undefined ? [] : [line.old]))
  return { from: old[0] ?? 0, to: old[old.length - 1] ?? 0, removed: true }
}

export const spanText = (span: CommentSpan) =>
  span.from === span.to ? String(span.from) : `${span.from}-${span.to}`

const firstNumber = (lines: readonly DiffLine[]) => {
  const first = lines[0]
  return first?.new ?? first?.old ?? 0
}

const sameLine = (a: DiffLine, b: DiffLine) => a.kind === b.kind && a.text === b.text

// Finds the comment's lines again in its file's change after a read: the same kinds and texts in order
// inside one hunk, the match nearest its old numbers; none, or no file, leaves it outdated where it was
export function locateComment(comment: ReviewComment, file: DiffFile | undefined): ReviewComment {
  const wanted = comment.lines
  const was = firstNumber(wanted)
  let best: { place: CommentPlace; lines: readonly DiffLine[]; distance: number } | undefined
  const hunks = wanted.length === 0 ? [] : (file?.hunks ?? [])
  for (const [index, hunk] of hunks.entries()) {
    for (let start = 0; start + wanted.length <= hunk.lines.length; start++) {
      const lines = hunk.lines.slice(start, start + wanted.length)
      if (!wanted.every((line, step) => sameLine(line, lines[step] ?? line))) continue
      const distance = Math.abs(firstNumber(lines) - was)
      if (best === undefined || distance < best.distance) {
        best = { place: { hunk: index, start }, lines, distance }
      }
    }
  }
  if (best === undefined) {
    return comment.place === undefined ? comment : { ...comment, place: undefined }
  }
  return { ...comment, lines: best.lines, place: best.place }
}

// Every comment against the files of a new read, each by its path
export function locateComments(
  comments: readonly ReviewComment[],
  files: readonly DiffFile[],
): ReviewComment[] {
  const byPath = new Map(files.map((file) => [file.path, file]))
  return comments.map((comment) => locateComment(comment, byPath.get(comment.path)))
}

// The index of the last line of a comment in its hunk, where it is drawn
export const lastLine = (place: CommentPlace, comment: ReviewComment) =>
  place.start + comment.lines.length - 1
