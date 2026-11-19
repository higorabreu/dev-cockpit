import { describe, expect, it } from 'vitest'
import { changeRows, type FileOpening, fileNotice, isCollapsed, lineToOpen } from './change-rows.ts'
import { hunkLines, type ReviewComment } from './comments.ts'
import type { DiffFile } from './diff.ts'
import { parseUnifiedDiff } from './parse.ts'

const text = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -4,2 +4,2 @@ function one() {',
  ' l4',
  '-l5',
  '+L5',
  'diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml',
  '--- a/pnpm-lock.yaml',
  '+++ b/pnpm-lock.yaml',
  '@@ -1 +1,2 @@',
  ' lockfileVersion: 9.0',
  '+importers: {}',
  'diff --git a/logo.png b/logo.png',
  'Binary files a/logo.png and b/logo.png differ',
  '',
].join('\n')

const files = (): readonly DiffFile[] =>
  parseUnifiedDiff(text).map((file) =>
    file.path === 'src/a.ts' ? { ...file, newLineCount: 8 } : file,
  )

const closed: FileOpening = {
  expanded: new Set(),
  text: undefined,
  shownAnyway: false,
  viewed: false,
  comments: [],
}

describe('fileNotice', () => {
  it('should name why a file shows no lines when it is binary, generated or empty', () => {
    const [source, lock, logo] = files()

    expect(source && fileNotice(source, false)).toBeUndefined()
    expect(lock && fileNotice(lock, false)).toBe('generated')
    expect(lock && fileNotice(lock, true)).toBeUndefined()
    expect(logo && fileNotice(logo, true)).toBe('binary')
  })

  it('should say the content waits when an untracked file is past the reading limit', () => {
    const [source] = files()
    const waiting = source && { ...source, hunks: [], unloaded: true as const }

    expect(waiting && fileNotice(waiting, true)).toBe('unloaded')
    expect(isCollapsed('unloaded')).toBe(false)
  })

  it('should let only a collapsed file be shown anyway', () => {
    expect(isCollapsed('generated')).toBe(true)
    expect(isCollapsed('large')).toBe(true)
    expect(isCollapsed('binary')).toBe(false)
    expect(isCollapsed(undefined)).toBe(false)
  })
})

describe('changeRows', () => {
  it('should put every file in one list with its header first and a collapsed file as its header alone', () => {
    const rows = changeRows(files(), () => closed)

    expect(rows.map((row) => `${row.kind}:${row.file}`)).toEqual([
      'file:0',
      'expand:0',
      'hunk:0',
      'line:0',
      'line:0',
      'line:0',
      'expand:0',
      'file:1',
      'file:2',
    ])
    expect(rows[7]).toEqual({ kind: 'file', file: 1, notice: 'generated', viewed: false })
  })

  it('should fold a viewed file to its header and keep the others open', () => {
    // Arrange
    const viewed = (file: { path: string }) => ({
      ...closed,
      viewed: file.path === files()[0]?.path,
    })

    // Act
    const rows = changeRows(files(), viewed)

    // Assert
    expect(rows.map((row) => `${row.kind}:${row.file}`)).toEqual(['file:0', 'file:1', 'file:2'])
    expect(rows[0]).toEqual({ kind: 'file', file: 0, notice: undefined, viewed: true })
  })

  it('should show the lines of a collapsed file when it is shown anyway', () => {
    const rows = changeRows(files(), (file) =>
      file.path === 'pnpm-lock.yaml' ? { ...closed, shownAnyway: true } : closed,
    )

    expect(rows.filter((row) => row.file === 1).map((row) => row.kind)).toEqual([
      'file',
      'hunk',
      'line',
      'line',
    ])
  })

  it('should unfold an opened gap into context lines of its file when its text is known', () => {
    const lines = Array.from({ length: 8 }, (_, index) => `n${index + 1}`)
    const rows = changeRows(files(), (file) =>
      file.path === 'src/a.ts' ? { ...closed, expanded: new Set([0]), text: lines } : closed,
    )

    expect(rows.slice(1, 4)).toEqual([
      { kind: 'context', file: 0, old: 1, new: 1, text: 'n1' },
      { kind: 'context', file: 0, old: 2, new: 2, text: 'n2' },
      { kind: 'context', file: 0, old: 3, new: 3, text: 'n3' },
    ])
  })

  it('should draw each comment under its last line and an outdated one under the header', () => {
    // Arrange
    const [source] = files()
    const hunk = source?.hunks[0]
    if (!source || !hunk) throw new Error('invariant: the fixture has a hunk')
    const current: ReviewComment = {
      id: 'c1',
      path: source.path,
      lines: hunkLines(hunk, 0, 1),
      body: 'why?',
      place: { hunk: 0, start: 0 },
    }
    const outdated: ReviewComment = { ...current, id: 'c2', place: undefined }

    // Act
    const rows = changeRows(files(), (file) =>
      file.path === source.path ? { ...closed, comments: [current, outdated] } : closed,
    )

    // Assert
    expect(rows.slice(0, 7).map((row) => (row.kind === 'comment' ? row.id : row.kind))).toEqual([
      'file',
      'c2',
      'expand',
      'hunk',
      'line',
      'line',
      'c1',
    ])
  })

  it('should leave the comments out of a folded file and list those of files gone at the end', () => {
    const gone: ReviewComment = {
      id: 'c3',
      path: 'src/old.ts',
      lines: [],
      body: 'gone',
      place: undefined,
    }
    const folded = { ...closed, viewed: true, comments: [{ ...gone, path: 'src/a.ts' }] }

    const rows = changeRows(files(), (file) => (file.path === 'src/a.ts' ? folded : closed), [gone])

    expect(rows.map((row) => `${row.kind}:${row.file}`)).toEqual([
      'file:0',
      'file:1',
      'file:2',
      'gone:3',
      'comment:3',
    ])
  })
})

describe('lineToOpen', () => {
  const twoHunks = [
    'diff --git a/src/b.ts b/src/b.ts',
    '--- a/src/b.ts',
    '+++ b/src/b.ts',
    '@@ -10,3 +10,2 @@',
    ' l10',
    '-l11',
    ' l12',
    '@@ -40,2 +39,3 @@',
    ' l40',
    '+n40',
    ' l41',
    '',
  ].join('\n')
  const setup = () => {
    const [file] = parseUnifiedDiff(twoHunks)
    if (!file) throw new Error('invariant: a file')
    const rows = changeRows([file], () => closed)
    const at = (kind: string, line?: number) =>
      rows.findIndex(
        (row) =>
          row.kind === kind && (line === undefined || (row.kind === 'line' && row.line === line)),
      )
    return { file, rows, at }
  }

  it('should open at the line under the cursor when the cursor is on the file', () => {
    // Arrange
    const { file, rows } = setup()
    const added = rows.findIndex((row) => row.kind === 'line' && row.hunk === 1 && row.line === 1)

    // Act
    const line = lineToOpen(file, 0, rows, { cursor: added, first: 0, last: rows.length - 1 })

    // Assert
    expect(line).toBe(40)
  })

  it('should open where a removed line was when the cursor is on it', () => {
    const { file, rows, at } = setup()

    const line = lineToOpen(file, 0, rows, { cursor: at('line', 1), first: 0, last: 0 })

    expect(line).toBe(11)
  })

  it('should open at the first changed line on screen when the cursor is on another file', () => {
    // Arrange
    const { file, rows } = setup()
    const secondHunk = rows.findIndex((row) => row.kind === 'hunk' && row.hunk === 1)

    // Act
    const line = lineToOpen(file, 0, rows, {
      cursor: 0,
      first: secondHunk,
      last: rows.length - 1,
    })

    // Assert
    expect(line).toBe(40)
  })

  it("should open at the file's first change when none of its lines is on screen", () => {
    const { file, rows } = setup()

    expect(lineToOpen(file, 0, rows, { cursor: -1, first: 0, last: -1 })).toBe(11)
  })

  it('should give no line when the file has no hunks', () => {
    const [, , logo] = files()

    expect(logo && lineToOpen(logo, 2, [], { cursor: 0, first: 0, last: 0 })).toBeUndefined()
  })
})
