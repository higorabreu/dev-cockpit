// Lines of one hunk picked for a comment: where the pick started and where it reaches now, as indexes
// into the hunk's lines; a range never leaves its hunk, as on GitHub
export interface LineSelection {
  readonly file: number
  readonly hunk: number
  readonly anchor: number
  readonly focus: number
}

// The lines a comment field opens for: a file, a hunk and the first and last of its lines
export interface CommentTarget {
  readonly file: number
  readonly hunk: number
  readonly from: number
  readonly to: number
}

export const selectLine = (file: number, hunk: number, line: number): LineSelection => ({
  file,
  hunk,
  anchor: line,
  focus: line,
})

// Reaches to another line; one in another hunk or file stops the range at the edge it crossed
export function extendSelection(
  selection: LineSelection,
  file: number,
  hunk: number,
  line: number,
  hunkLength: number,
): LineSelection {
  const order = file - selection.file || hunk - selection.hunk
  const focus = order === 0 ? line : order > 0 ? hunkLength - 1 : 0
  return { ...selection, focus: Math.max(0, Math.min(hunkLength - 1, focus)) }
}

export function selectionTarget(selection: LineSelection): CommentTarget {
  return {
    file: selection.file,
    hunk: selection.hunk,
    from: Math.min(selection.anchor, selection.focus),
    to: Math.max(selection.anchor, selection.focus),
  }
}

export function isSelected(
  selection: LineSelection | undefined,
  file: number,
  hunk: number,
  line: number,
): boolean {
  if (selection === undefined || selection.file !== file || selection.hunk !== hunk) return false
  const { from, to } = selectionTarget(selection)
  return line >= from && line <= to
}
