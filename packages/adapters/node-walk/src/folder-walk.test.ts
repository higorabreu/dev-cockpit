import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFolderWalk } from './folder-walk.ts'

let directory = ''

async function tree(files: readonly string[]) {
  for (const file of files) {
    const path = join(directory, ...file.split('/'))
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, 'x')
  }
}

const unlimited = { maxEntries: 1000, timeoutMs: 10_000 }

beforeEach(async () => {
  // macOS links /var to /private/var; the walk reports paths under the real one
  directory = await realpath(await mkdtemp(join(tmpdir(), 'dck-walk-')))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('createFolderWalk', () => {
  it('should list the files breadth first with / between folders when walking the root', async () => {
    await tree(['b/deep/c.txt', 'a.txt', 'b/b.txt'])

    const result = await createFolderWalk().walk(directory, '', unlimited)

    expect(result).toEqual({ entries: ['a.txt', 'b/b.txt', 'b/deep/c.txt'], truncated: false })
  })

  it('should skip the named folders wherever they are', async () => {
    await tree(['src/a.ts', 'node_modules/x/i.js', 'src/dist/out.js'])

    const result = await createFolderWalk().walk(directory, '', {
      ...unlimited,
      skip: ['node_modules', 'dist'],
    })

    expect(result.entries).toEqual(['src/a.ts'])
  })

  it('should stop and say so when the entry cap is reached', async () => {
    await tree(['a.txt', 'b.txt', 'c.txt'])

    const result = await createFolderWalk().walk(directory, '', { ...unlimited, maxEntries: 2 })

    expect(result).toEqual({ entries: ['a.txt', 'b.txt'], truncated: true })
  })

  it('should stop and say so when the time runs out', async () => {
    await tree(['a/one.txt', 'b/two.txt'])
    let clock = 0

    const result = await createFolderWalk({ now: () => (clock += 60) }).walk(directory, '', {
      ...unlimited,
      timeoutMs: 100,
    })

    expect(result.truncated).toBe(true)
  })

  it('should list two levels and name deeper folders closed when stepping into a folder', async () => {
    await tree([
      'node_modules/react/index.js',
      'node_modules/react/cjs/react.js',
      'node_modules/.bin.txt',
    ])

    const result = await createFolderWalk().walk(directory, 'node_modules/', {
      ...unlimited,
      maxDepth: 2,
    })

    expect(result.entries).toEqual([
      'node_modules/.bin.txt',
      'node_modules/react/cjs/',
      'node_modules/react/index.js',
    ])
  })

  it('should list a link to a file and never follow a link to a folder', async () => {
    await tree(['real/inside.txt', 'file.txt'])
    await symlink(join(directory, 'real'), join(directory, 'folder-link'))
    await symlink(join(directory, 'file.txt'), join(directory, 'file-link'))

    const result = await createFolderWalk().walk(directory, '', unlimited)

    expect(result.entries).toEqual(['file-link', 'file.txt', 'real/inside.txt'])
  })

  it('should list nothing when the folder to step into is a link', async () => {
    await tree(['real/inside.txt'])
    await symlink(join(directory, 'real'), join(directory, 'linked'))

    const result = await createFolderWalk().walk(directory, 'linked/', unlimited)

    expect(result).toEqual({ entries: [], truncated: false })
  })
})
