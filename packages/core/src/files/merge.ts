import { diffLines, type Hunk, splitLines } from './line-diff.ts'

export const MERGE_LIMITS = {
  // A disk that changed more of the lines than this was rewritten (a formatter), not edited beside the user
  diskShare: 0.3,
  // Below this many lines a small file would never merge by the share alone
  minDiskLines: 3,
  // Inserted plus deleted lines on either side; past it the diff costs too much to run on a change
  maxEdits: 2000,
} as const

// Replaces [from, to) of the user's text, in characters, with `insert`
export interface TextEdit {
  readonly from: number
  readonly to: number
  readonly insert: string
}

// Lines [from, to) of the merged text, counted from 0; empty where the disk only deleted
export interface LineRange {
  readonly from: number
  readonly to: number
}

// `same-lines`: both changed the same or adjacent lines. `many-lines`: the disk rewrote the file, or a side
// changed more than the merge reads
export type MergeConflict = 'same-lines' | 'many-lines'

export type MergeOutcome =
  | {
      readonly kind: 'merged'
      readonly text: string
      // The disk's changes over the user's text, in order, to apply without touching the user's undo
      readonly edits: readonly TextEdit[]
      readonly fromDisk: readonly LineRange[]
    }
  | { readonly kind: 'conflict'; readonly reason: MergeConflict }

interface SideHunk extends Hunk {
  readonly side: 'mine' | 'disk'
}

// The lines a side holds for base lines [from, to), given its hunks inside that range
function sideLines(
  base: readonly string[],
  lines: readonly string[],
  hunks: readonly Hunk[],
  from: number,
  to: number,
): string[] {
  const out: string[] = []
  let at = from
  for (const hunk of hunks) {
    out.push(...base.slice(at, hunk.aStart), ...lines.slice(hunk.bStart, hunk.bEnd))
    at = hunk.aEnd
  }
  out.push(...base.slice(at, to))
  return out
}

// Hunks of both sides that overlap or touch form one group, as git's merge counts adjacent lines as a
// conflict
function groups(hunks: readonly SideHunk[]): SideHunk[][] {
  const sorted = [...hunks].sort((left, right) => left.aStart - right.aStart)
  const result: SideHunk[][] = []
  let end = -1
  for (const hunk of sorted) {
    const last = result.at(-1)
    if (last && hunk.aStart <= end) {
      last.push(hunk)
      end = Math.max(end, hunk.aEnd)
    } else {
      result.push([hunk])
      end = hunk.aEnd
    }
  }
  return result
}

const changedLines = (hunks: readonly Hunk[]) =>
  hunks.reduce((sum, hunk) => sum + Math.max(hunk.aEnd - hunk.aStart, hunk.bEnd - hunk.bStart), 0)

// A line based three-way merge, as `git merge-file`, of the text read last, the user's and the disk's
export function mergeThreeWay(base: string, mine: string, disk: string): MergeOutcome {
  const baseLines = splitLines(base)
  const mineLines = splitLines(mine)
  const diskLines = splitLines(disk)
  const diskAllowed = Math.max(MERGE_LIMITS.minDiskLines, MERGE_LIMITS.diskShare * baseLines.length)
  const diskHunks = diffLines(
    baseLines,
    diskLines,
    Math.min(MERGE_LIMITS.maxEdits, 2 * Math.ceil(diskAllowed)),
  )
  if (diskHunks === undefined || changedLines(diskHunks) > diskAllowed)
    return { kind: 'conflict', reason: 'many-lines' }
  const mineHunks = diffLines(baseLines, mineLines, MERGE_LIMITS.maxEdits)
  if (mineHunks === undefined) return { kind: 'conflict', reason: 'many-lines' }

  const starts = [0]
  for (const line of mineLines) starts.push((starts.at(-1) ?? 0) + line.length)
  const offsetOf = (line: number) => starts[line] ?? mine.length

  const out: string[] = []
  const edits: TextEdit[] = []
  const fromDisk: LineRange[] = []
  let baseAt = 0
  let mineAt = 0
  const all = [
    ...mineHunks.map((hunk) => ({ ...hunk, side: 'mine' as const })),
    ...diskHunks.map((hunk) => ({ ...hunk, side: 'disk' as const })),
  ]
  for (const group of groups(all)) {
    const from = Math.min(...group.map((hunk) => hunk.aStart))
    const to = Math.max(...group.map((hunk) => hunk.aEnd))
    out.push(...baseLines.slice(baseAt, from))
    mineAt += from - baseAt
    const ofMine = group.filter((hunk) => hunk.side === 'mine')
    const ofDisk = group.filter((hunk) => hunk.side === 'disk')
    const mineVersion = sideLines(baseLines, mineLines, ofMine, from, to)
    const diskVersion = sideLines(baseLines, diskLines, ofDisk, from, to)
    if (ofMine.length > 0 && ofDisk.length > 0) {
      // Both made the same change: git takes it once, and the user's text already holds it
      if (mineVersion.join('') !== diskVersion.join(''))
        return { kind: 'conflict', reason: 'same-lines' }
      out.push(...mineVersion)
    } else if (ofDisk.length > 0) {
      const insert = diskVersion.join('')
      edits.push({ from: offsetOf(mineAt), to: offsetOf(mineAt + to - from), insert })
      fromDisk.push({ from: out.length, to: out.length + diskVersion.length })
      out.push(...diskVersion)
    } else out.push(...mineVersion)
    mineAt += mineVersion.length
    baseAt = to
  }
  out.push(...baseLines.slice(baseAt))
  return { kind: 'merged', text: out.join(''), edits, fromDisk }
}
