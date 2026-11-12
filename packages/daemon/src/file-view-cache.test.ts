import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type MergeRequestSummary, silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileViewCache } from './file-view-cache.ts'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dck-views-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const item: MergeRequestSummary = {
  id: 'g/p!1',
  number: 1,
  title: 't',
  url: 'https://gl.test/x',
  project: 'g/p',
  author: 'ana',
  sourceBranch: 'a',
  targetBranch: 'main',
  draft: false,
  updatedAt: '2026-11-11T10:00:00Z',
  hasConflicts: false,
  openDiscussions: false,
  pipeline: 'success',
}

describe('createFileViewCache', () => {
  it('should read back what it saved when the file is intact', async () => {
    const cache = createFileViewCache(join(dir, 'sub', 'views.json'), silentLogger)
    const data = { scope: 'https://gl.test', views: { review: { items: [item], updatedAt: 5 } } }

    await cache.save(data)

    expect(await cache.load()).toEqual(data)
  })

  it('should return nothing when the file does not exist', async () => {
    const cache = createFileViewCache(join(dir, 'missing.json'), silentLogger)

    expect(await cache.load()).toBeUndefined()
  })

  it.each([
    ['is not json', 'not json'],
    ['has the wrong shape', JSON.stringify({ scope: 1 })],
    [
      'has an item with an unknown pipeline',
      JSON.stringify({
        scope: 's',
        views: { review: { updatedAt: 1, items: [{ ...item, pipeline: 'weird' }] } },
      }),
    ],
  ])('should return nothing when the file %s', async (_label, content) => {
    const file = join(dir, 'views.json')
    await writeFile(file, content)

    expect(await createFileViewCache(file, silentLogger).load()).toBeUndefined()
  })

  it('should leave no temporary file behind when saving', async () => {
    const file = join(dir, 'views.json')

    await createFileViewCache(file, silentLogger).save({ scope: 's', views: {} })

    expect(JSON.parse(await readFile(file, 'utf8')).scope).toBe('s')
    await expect(readFile(`${file}.tmp`, 'utf8')).rejects.toThrow()
  })
})
