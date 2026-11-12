import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRecencyStore } from './recency-store.ts'

let directory = ''
let file = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-recency-'))
  file = join(directory, 'nested', 'recent.json')
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('createRecencyStore', () => {
  it('should start empty when the file does not exist', async () => {
    const store = createRecencyStore(file, silentLogger)

    expect(await store.list()).toEqual([])
  })

  it('should put the touched path first and keep it once when touching repeatedly', async () => {
    const store = createRecencyStore(file, silentLogger)

    await store.touch('/a')
    await store.touch('/b')
    await store.touch('/a')

    expect(await store.list()).toEqual(['/a', '/b'])
  })

  it('should survive a restart when the order was saved', async () => {
    await createRecencyStore(file, silentLogger).touch('/a')

    const reopened = createRecencyStore(file, silentLogger)

    expect(await reopened.list()).toEqual(['/a'])
  })

  it('should start empty when the file content is not valid', async () => {
    await createRecencyStore(file, silentLogger).touch('/a')
    await writeFile(file, '{"not":"a list"}')

    const store = createRecencyStore(file, silentLogger)

    expect(await store.list()).toEqual([])
  })

  it('should start empty when the file is not json', async () => {
    await createRecencyStore(file, silentLogger).touch('/a')
    await writeFile(file, 'oops')

    const store = createRecencyStore(file, silentLogger)

    expect(await store.list()).toEqual([])
  })

  it('should write the saved order as a json list when touching', async () => {
    await createRecencyStore(file, silentLogger).touch('/a')

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(['/a'])
  })
})
