import type { FileChange, FileStamp } from '../ports/file-store.ts'
import { type MergeConflict, type MergeOutcome, mergeThreeWay } from './merge.ts'
import { lineEndingOf, type TextEncoding } from './text-codec.ts'

// The same bytes: a touch moves the time and changes nothing
export const sameContent = (left: FileStamp, right: FileStamp) =>
  left.size === right.size && left.hash === right.hash

// Before a save, against what the disk holds now (undefined: no file); `expected` null wants no file there
export function saveStep(
  expected: FileStamp | null,
  disk: FileStamp | undefined,
): 'write' | 'conflict' {
  if (expected === null) return disk === undefined ? 'write' : 'conflict'
  return disk !== undefined && sameContent(expected, disk) ? 'write' : 'conflict'
}

// On a change the watcher reported: nothing when the disk holds the base (the cockpit's own save), else
// the disk's text must be read to decide
export function changeStep(base: FileStamp, change: FileChange): 'ignore' | 'read' | 'deleted' {
  if (change.kind === 'deleted') return 'deleted'
  return sameContent(base, change.stamp) ? 'ignore' : 'read'
}

export interface TextSide {
  readonly text: string
  readonly encoding: TextEncoding
}

export type ConflictReason =
  | MergeConflict
  // Merging by itself is turned off (`files.autoMerge`)
  | 'merge-off'
  | 'encoding'
  | 'line-endings'
  | 'not-text'
  // Deleted or renamed away (`changeStep`)
  | 'deleted'

export type DiskOutcome =
  // Take the disk's text: the user had no edits, or already typed what the disk holds
  | { readonly kind: 'reload' }
  | Extract<MergeOutcome, { kind: 'merged' }>
  | { readonly kind: 'conflict'; readonly reason: ConflictReason }

export interface DiskText {
  // What was read last, the merge's common ancestor
  readonly base: TextSide
  // The editor's text
  readonly mine: string
  // Undefined when the disk's file is no longer text the editor can change (binary, too large)
  readonly disk: TextSide | undefined
  readonly autoMerge: boolean
}

// Line endings that differ only by a side that has no line break at all still agree
const sameEndings = (left: string, right: string) => {
  const [a, b] = [lineEndingOf(left), lineEndingOf(right)]
  return a === b || a === 'none' || b === 'none'
}

// The disk changed under an open file: reload, merge the disk's changes into the user's, or a conflict
export function settleDiskText(input: DiskText): DiskOutcome {
  const { base, mine, disk } = input
  if (disk === undefined) return { kind: 'conflict', reason: 'not-text' }
  if (mine === base.text || mine === disk.text) return { kind: 'reload' }
  if (!input.autoMerge) return { kind: 'conflict', reason: 'merge-off' }
  if (disk.encoding !== base.encoding) return { kind: 'conflict', reason: 'encoding' }
  if (!sameEndings(base.text, disk.text) || !sameEndings(base.text, mine))
    return { kind: 'conflict', reason: 'line-endings' }
  return mergeThreeWay(base.text, mine, disk.text)
}
