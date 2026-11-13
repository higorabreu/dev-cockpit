import { collapseReason, type DiffFile } from './diff.ts'
import { type DiffGap, diffRows } from './rows.ts'

// Why a file shows no lines: it cannot be read here, or it starts collapsed until asked
export type FileNotice = 'omitted' | 'non-utf8' | 'binary' | 'generated' | 'large' | 'no-content'

export function fileNotice(file: DiffFile, shownAnyway: boolean): FileNotice | undefined {
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
// left out (or opened); `file` is the file's index
export type ChangeRow =
  | { readonly kind: 'file'; readonly file: number; readonly notice: FileNotice | undefined }
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

// What the user did to one file: the gaps opened, the text that fills them, a collapse lifted
export interface FileOpening {
  readonly expanded: ReadonlySet<number>
  readonly text: readonly string[] | undefined
  readonly shownAnyway: boolean
}

// All the files in one list, the way a merge request reads: a file with a notice is its header alone
export function changeRows(
  files: readonly DiffFile[],
  opening: (file: DiffFile) => FileOpening,
): ChangeRow[] {
  const rows: ChangeRow[] = []
  files.forEach((file, index) => {
    const { expanded, text, shownAnyway } = opening(file)
    const notice = fileNotice(file, shownAnyway)
    rows.push({ kind: 'file', file: index, notice })
    if (notice !== undefined) return
    for (const row of diffRows(file, expanded, text)) {
      if (row.kind === 'end') rows.push({ kind: 'expand', file: index, gap: row.gap })
      else if (row.kind === 'hunk') {
        if (row.gap) rows.push({ kind: 'expand', file: index, gap: row.gap })
        rows.push({ kind: 'hunk', file: index, hunk: row.hunk })
      } else if (row.kind === 'line') {
        rows.push({ kind: 'line', file: index, hunk: row.hunk, line: row.line })
      } else rows.push({ ...row, file: index })
    }
  })
  return rows
}
