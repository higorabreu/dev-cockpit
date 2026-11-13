import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Logger, type MergeRequestSummary, silentLogger, type ViewItem } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileViewCache } from './file-view-cache.ts'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dck-views-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const summary: MergeRequestSummary = {
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

const item: ViewItem = { kind: 'mergeRequest', ...summary }

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

  it('should read a cache written before connectors as merge requests when its items have no kind', async () => {
    const file = join(dir, 'views-cache.json')
    await writeFile(
      file,
      JSON.stringify({
        scope: 'https://gl.test',
        views: { review: { items: [summary], updatedAt: 5 } },
      }),
    )

    const data = await createFileViewCache(file, silentLogger).load()

    expect(data?.views.review?.items).toEqual([item])
  })

  it('should keep a view of issues when it was saved', async () => {
    const cache = createFileViewCache(join(dir, 'views.json'), silentLogger)
    const issue: ViewItem = {
      kind: 'issue',
      id: '10001',
      key: 'ACME-12',
      summary: 'Export the report',
      url: 'https://acme.example.com/browse/ACME-12',
      project: 'ACME',
      type: 'Bug',
      status: 'To Do',
      statusCategory: 'todo',
      updatedAt: '2026-11-11T10:00:00Z',
    }
    const data = { scope: 's', views: { tasks: { items: [issue], updatedAt: 5 } } }

    await cache.save(data)

    expect(await cache.load()).toEqual(data)
  })

  it('should leave no temporary file behind when saving', async () => {
    const file = join(dir, 'views.json')

    await createFileViewCache(file, silentLogger).save({ scope: 's', views: {} })

    expect(JSON.parse(await readFile(file, 'utf8')).scope).toBe('s')
    await expect(readFile(`${file}.tmp`, 'utf8')).rejects.toThrow()
  })

  it('should keep the last data without an error when two saves run at the same time', async () => {
    const file = join(dir, 'views-cache.json')
    const errors: string[] = []
    const logger: Logger = { ...silentLogger, error: (message) => errors.push(message) }
    const cache = createFileViewCache(file, logger)
    const first = { scope: 's', views: { review: { items: [item], updatedAt: 1 } } }
    const second = { scope: 's', views: { mine: { items: [item], updatedAt: 2 } } }

    await Promise.all([cache.save(first), cache.save(second)])

    expect(errors).toEqual([])
    expect(await cache.load()).toEqual(second)
  })
})
