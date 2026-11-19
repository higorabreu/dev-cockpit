import { describe, expect, it } from 'vitest'
import type { FolderWalk, GitFiles, GitOthers, WalkLimits } from '../ports/project-files.ts'
import {
  absolutePath,
  createFileFinder,
  FOLDER_LIMITS,
  relativePath,
  STEP_LIMITS,
} from './file-finder.ts'

function fakeWalk(entries: readonly string[]) {
  const calls: { root: string; from: string; limits: WalkLimits }[] = []
  const walk: FolderWalk = {
    walk: async (root, from, limits) => {
      calls.push({ root, from, limits })
      return { entries, truncated: false }
    },
  }
  return { walk, calls }
}

const others: GitOthers = {
  files: ['notes.md'],
  ignored: ['.env', 'node_modules/'],
  truncated: false,
}

const repository: GitFiles = {
  tracked: async () => ({ root: '/home/ana/acme', files: ['src/app.ts'], truncated: false }),
  others: async () => others,
}

const noRepository: GitFiles = {
  tracked: async () => undefined,
  others: async () => ({ files: [], ignored: [], truncated: false }),
}

describe('createFileFinder', () => {
  it('should list the tracked files first and the others apart when the folder is inside a repository', async () => {
    const { walk, calls } = fakeWalk([])
    const finder = createFileFinder({ git: repository, walk })

    const listing = await finder.list('/home/ana/acme/src')
    const rest = await finder.others(listing.root)

    expect(listing).toEqual({
      kind: 'git',
      root: '/home/ana/acme',
      files: ['src/app.ts'],
      ignored: [],
      truncated: false,
      partial: true,
    })
    expect(rest).toEqual(others)
    expect(calls).toEqual([])
  })

  it('should walk the folder within its bounds when it is outside a repository', async () => {
    const { walk, calls } = fakeWalk(['notes.md', 'drafts/plan.md', 'drafts/old/'])
    const finder = createFileFinder({ git: noRepository, walk })

    const listing = await finder.list('/home/ana/notes')

    expect(listing).toEqual({
      kind: 'folder',
      root: '/home/ana/notes',
      files: ['notes.md', 'drafts/plan.md'],
      ignored: [],
      truncated: false,
      partial: false,
    })
    expect(calls).toEqual([{ root: '/home/ana/notes', from: '', limits: FOLDER_LIMITS }])
    expect(FOLDER_LIMITS).toMatchObject({ maxEntries: 20_000, timeoutMs: 2000 })
    expect(FOLDER_LIMITS.skip).toEqual(
      expect.arrayContaining([
        'node_modules',
        '.git',
        'dist',
        'build',
        'target',
        '.venv',
        '__pycache__',
      ]),
    )
  })

  it('should step two levels into a closed folder with the step bounds when expanding', async () => {
    const { walk, calls } = fakeWalk(['node_modules/zod/index.js'])
    const finder = createFileFinder({ git: repository, walk })

    const result = await finder.expand('/home/ana/acme', 'node_modules/')

    expect(result.entries).toEqual(['node_modules/zod/index.js'])
    expect(calls).toEqual([{ root: '/home/ana/acme', from: 'node_modules/', limits: STEP_LIMITS }])
    expect(STEP_LIMITS).toEqual({ maxEntries: 2000, timeoutMs: 300, maxDepth: 2 })
  })
})

describe('absolutePath and relativePath', () => {
  it('should join a listing path to its root with the root separator', () => {
    expect(absolutePath('/home/ana/acme', 'src/app.ts')).toBe('/home/ana/acme/src/app.ts')
    expect(absolutePath('C:\\work\\acme', 'src/app.ts')).toBe('C:\\work\\acme\\src\\app.ts')
  })

  it('should name a path inside the root as a listing does', () => {
    expect(relativePath('/home/ana/acme', '/home/ana/acme/src/app.ts')).toBe('src/app.ts')
    expect(relativePath('C:\\work\\acme', 'C:\\work\\acme\\src\\app.ts')).toBe('src/app.ts')
  })

  it('should be undefined when the path is outside the root', () => {
    expect(relativePath('/home/ana/acme', '/home/ana/acme-old/a.ts')).toBeUndefined()
    expect(relativePath('/home/ana/acme', '/home/ana/acme')).toBeUndefined()
  })
})
