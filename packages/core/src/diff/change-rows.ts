import { lastLine, type ReviewComment } from './comments.ts'
import { collapseReason, type DiffFile } from './diff.ts'
import { type DiffGap, diffRows } from './rows.ts'

// Why a file shows no lines: it cannot be read here, its content waits to be asked for, or it starts
// collapsed until asked
export type FileNotice =
  | 'omitted'
  | 'non-utf8'
  | 'binary'
  | 'generated'
  | 'large'
  | 'no-content'
  | 'unloaded'

export function fileNotice(file: DiffFile, shownAnyway: boolean): FileNotice | undefined {
  if (file.unloaded) return 'unloaded'
  if (file.omitted) return 'omitted'
  if (file.nonUtf8) return 'non-utf8'
  if (file.binary) return 'binary'
  const reason = collapseReason(file)
  if (reason !== undefined && !shownAnyway) return reason
  return file.hunks.length === 0 ? 'no-content' : undefined
}

// A notice the user can lift with "Show anyway"
export const isCollapsed = (notice: FileNotice | undefined) =>
  notice === 'generated' || notice === 'large'

// One row of the whole change: every file's header, then its hunks, lines and the unchanged stretches
// left out (or opened), and the pending comments; `file` is the file's index. Comments whose file left the
// change come last under their own header, with the index after the last file
export type ChangeRow =
  | {
      readonly kind: 'file'
      readonly file: number
      readonly notice: FileNotice | undefined
      // Marked viewed: the header alone, until the mark goes
      readonly viewed: boolean
    }
  | { readonly kind: 'expand'; readonly file: number; readonly gap: DiffGap }
  | { readonly kind: 'hunk'; readonly file: number; readonly hunk: number }
  | { readonly kind: 'line'; readonly file: number; readonly hunk: number; readonly line: number }
  | {
      readonly kind: 'context'
      readonly file: number
      readonly old: number
      readonly new: number
      readonly text: string
    }
  | { readonly kind: 'comment'; readonly file: number; readonly id: string }
  | { readonly kind: 'gone'; readonly file: number }

// What the user did to one file: the gaps opened, the text that fills them, a collapse lifted, a mark,
// the comments left on it
export interface FileOpening {
  readonly expanded: ReadonlySet<number>
  readonly text: readonly string[] | undefined
  readonly shownAnyway: boolean
  readonly viewed: boolean
  readonly comments: readonly ReviewComment[]
}

// Each comment under the last of its lines, by hunk and line; an outdated one under the file's header
function commentsByLine(comments: readonly ReviewComment[]) {
  const outdated: string[] = []
  const byLine = new Map<string, string[]>()
  for (const comment of comments) {
    if (comment.place === undefined) {
      outdated.push(comment.id)
      continue
    }
    const key = `${comment.place.hunk}:${lastLine(comment.place, comment)}`
    byLine.set(key, [...(byLine.get(key) ?? []), comment.id])
  }
  return { outdated, byLine }
}

// All the files in one list, the way a merge request reads: a file with a notice, or viewed, is its
// header alone. `gone` are the comments on files no longer in the change
export function changeRows(
  files: readonly DiffFile[],
  opening: (file: DiffFile) => FileOpening,
  gone: readonly ReviewComment[] = [],
): ChangeRow[] {
  const rows: ChangeRow[] = []
  files.forEach((file, index) => {
    const { expanded, text, shownAnyway, viewed, comments } = opening(file)
    const notice = fileNotice(file, shownAnyway)
    rows.push({ kind: 'file', file: index, notice, viewed })
    if (notice !== undefined || viewed) return
    const { outdated, byLine } = commentsByLine(comments)
    for (const id of outdated) rows.push({ kind: 'comment', file: index, id })
    for (const row of diffRows(file, expanded, text)) {
      if (row.kind === 'end') rows.push({ kind: 'expand', file: index, gap: row.gap })
      else if (row.kind === 'hunk') {
        if (row.gap) rows.push({ kind: 'expand', file: index, gap: row.gap })
        rows.push({ kind: 'hunk', file: index, hunk: row.hunk })
      } else if (row.kind === 'line') {
        rows.push({ kind: 'line', file: index, hunk: row.hunk, line: row.line })
        for (const id of byLine.get(`${row.hunk}:${row.line}`) ?? []) {
          rows.push({ kind: 'comment', file: index, id })
        }
      } else rows.push({ ...row, file: index })
    }
  })
  if (gone.length === 0) return rows
  rows.push({ kind: 'gone', file: files.length })
  for (const comment of gone) rows.push({ kind: 'comment', file: files.length, id: comment.id })
  return rows
}
