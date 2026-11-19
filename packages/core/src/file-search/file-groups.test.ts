import { describe, expect, it } from 'vitest'
import {
  createFileSearch,
  FILE_ROWS,
  type FileRow,
  folderToStep,
  IGNORED_ROWS,
  stepRows,
} from './file-groups.ts'

const files = ['src/app.ts', 'src/environment.ts', 'README.md', 'package.json']
const ignored = ['.env', '.env.local', 'dist/', 'node_modules/', 'notes.txt']

const paths = (rows: readonly FileRow[]) => rows.map((row) => row.path)

describe('createFileSearch', () => {
  it('should list recent files first and then the project when the query is empty', () => {
    const search = createFileSearch({ files, ignored, recent: ['README.md'] })

    const groups = search.groups('', false)

    expect(paths(groups.project)).toEqual([
      'README.md',
      'src/app.ts',
      'src/environment.ts',
      'package.json',
    ])
    expect(groups.ignored).toEqual([])
  })

  it('should accept an empty recent list when the query is empty', () => {
    const groups = createFileSearch({ files, ignored, recent: [] }).groups('', false)

    expect(paths(groups.project)).toEqual(files)
  })

  it('should keep an ignored file the user opened among the recent ones when the query is empty', () => {
    const groups = createFileSearch({ files, ignored, recent: ['.env'] }).groups('', false)

    expect(groups.project[0]).toEqual({ path: '.env', ignored: true, folder: false })
  })

  it('should leave out a recent file the listing does not know', () => {
    const groups = createFileSearch({ files, ignored, recent: ['gone.ts'] }).groups('', false)

    expect(paths(groups.project)).toEqual(files)
  })

  it('should show the project matches first and the ignored ones apart when both match', () => {
    const groups = createFileSearch({ files, ignored, recent: [] }).groups('env', false)

    expect(paths(groups.project)).toEqual(['src/environment.ts'])
    expect(paths(groups.ignored)).toEqual(['.env', '.env.local'])
    expect(groups.ignored.every((row) => row.ignored)).toBe(true)
    expect(groups.loose).toBe(false)
  })

  it('should not show the ignored group when the query has fewer than three letters', () => {
    const groups = createFileSearch({ files, ignored, recent: [] }).groups('ap', false)

    expect(paths(groups.project)).toEqual(['src/app.ts'])
    expect(groups.ignored).toEqual([])
  })

  it('should keep five ignored rows and count the rest when more ignored files match', () => {
    const many = Array.from({ length: 8 }, (_, index) => `logs/build-${index}.log`)

    const project = [...files, 'scripts/build.ts']

    const groups = createFileSearch({ files: project, ignored: many, recent: [] }).groups(
      'build',
      false,
    )

    expect(paths(groups.project)).toEqual(['scripts/build.ts'])
    expect(groups.ignored).toHaveLength(IGNORED_ROWS)
    expect(groups.more).toBe(3)
  })

  it('should match ignored files by the fuzzy rule and show them all when widened', () => {
    const many = Array.from({ length: 8 }, (_, index) => `logs/build-${index}.log`)

    const groups = createFileSearch({ files, ignored: many, recent: [] }).groups('lgb', true)

    expect(groups.ignored).toHaveLength(8)
    expect(groups.more).toBe(0)
    expect(groups.loose).toBe(true)
  })

  it('should widen by itself when the project has no match', () => {
    const groups = createFileSearch({ files, ignored, recent: [] }).groups('notes', false)

    expect(groups.project).toEqual([])
    expect(paths(groups.ignored)).toEqual(['notes.txt'])
    expect(groups.loose).toBe(true)
  })

  it('should list every ignored entry after the project when widened with an empty query', () => {
    const groups = createFileSearch({ files, ignored, recent: [] }).groups('', true)

    expect(paths(groups.ignored)).toEqual(ignored)
  })

  it('should mark a closed folder as a row to step into when it matches', () => {
    const groups = createFileSearch({ files, ignored, recent: [] }).groups('modules', false)

    expect(groups.ignored).toEqual([{ path: 'node_modules/', ignored: true, folder: true }])
  })

  it('should find a recent ignored file by the fuzzy rule among the project files', () => {
    const groups = createFileSearch({ files, ignored, recent: ['.env.local'] }).groups(
      'envl',
      false,
    )

    expect(groups.project).toContainEqual({ path: '.env.local', ignored: true, folder: false })
  })

  it('should draw at most the row limit when many project files match', () => {
    const many = Array.from({ length: FILE_ROWS + 20 }, (_, index) => `src/file-${index}.ts`)

    const groups = createFileSearch({ files: many, ignored: [], recent: [] }).groups('file', false)

    expect(groups.project).toHaveLength(FILE_ROWS)
  })
})

describe('folderToStep', () => {
  const closed = ['node_modules/', 'dist/', 'node_modules/react/cjs/']

  it('should name the closed folder the query goes into', () => {
    expect(folderToStep('dist/', closed)).toBe('dist/')
    expect(folderToStep('node_modules/react/in', closed)).toBe('node_modules/')
  })

  it('should take the deepest closed folder when the query goes through several', () => {
    expect(folderToStep('node_modules/react/cjs/re', closed)).toBe('node_modules/react/cjs/')
  })

  it('should be undefined when the query does not go into a closed folder', () => {
    expect(folderToStep('node', closed)).toBeUndefined()
    expect(folderToStep('src/', closed)).toBeUndefined()
  })

  it('should ignore case when comparing the folder', () => {
    expect(folderToStep('Dist/', closed)).toBe('dist/')
  })
})

describe('stepRows', () => {
  const entries = [
    'node_modules/react/index.js',
    'node_modules/react/package.json',
    'node_modules/react/cjs/',
    'node_modules/zod/index.js',
  ]

  it('should list the folder alone when nothing is typed after it', () => {
    expect(paths(stepRows('node_modules/', entries, 'node_modules/'))).toEqual(entries)
  })

  it('should filter the inside by what is typed after the folder', () => {
    expect(paths(stepRows('node_modules/', entries, 'node_modules/zodin'))).toEqual([
      'node_modules/zod/index.js',
    ])
  })

  it('should mark the closed folders inside as rows to step into', () => {
    const rows = stepRows('node_modules/', entries, 'node_modules/cjs')

    expect(rows[0]).toEqual({ path: 'node_modules/react/cjs/', ignored: true, folder: true })
  })
})
