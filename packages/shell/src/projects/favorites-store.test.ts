import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFavoritesStore } from './favorites-store.ts'

let directory = ''
let file = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-fav-'))
  file = join(directory, 'nested', 'favorites.json')
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('createFavoritesStore', () => {
  it('should start empty when the file does not exist', async () => {
    expect(await createFavoritesStore(file, silentLogger).list()).toEqual([])
  })

  it('should pin a project and report it as pinned when toggling a project that is not pinned', async () => {
    const store = createFavoritesStore(file, silentLogger)

    expect(await store.toggle('/a')).toBe(true)
    expect(await store.list()).toEqual(['/a'])
  })

  it('should unpin and report it as not pinned when toggling a pinned project', async () => {
    const store = createFavoritesStore(file, silentLogger)
    await store.toggle('/a')

    expect(await store.toggle('/a')).toBe(false)
    expect(await store.list()).toEqual([])
  })

  it('should put the newest pinned project first when pinning several', async () => {
    const store = createFavoritesStore(file, silentLogger)
    await store.toggle('/a')
    await store.toggle('/b')

    expect(await store.list()).toEqual(['/b', '/a'])
  })

  it('should survive a restart when the favorites were saved', async () => {
    await createFavoritesStore(file, silentLogger).toggle('/a')

    expect(await createFavoritesStore(file, silentLogger).list()).toEqual(['/a'])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(['/a'])
  })

  it('should start empty when the file content is not valid', async () => {
    await createFavoritesStore(file, silentLogger).toggle('/a')
    await writeFile(file, '{"not":"a list"}')

    expect(await createFavoritesStore(file, silentLogger).list()).toEqual([])
  })
})
