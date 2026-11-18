import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSavedTabsFile } from './saved-tabs-file.ts'

let directory = ''
let file = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-tabs-'))
  file = join(directory, 'nested', 'open-tabs.json')
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const saved = {
  tabs: [{ cwd: '/home/ana/acme', label: 'acme', project: '/home/ana/acme' }, { name: 'deploys' }],
  active: 1,
}

describe('createSavedTabsFile', () => {
  it('should have no tabs when nothing was saved yet', async () => {
    expect(await createSavedTabsFile(file, silentLogger).load()).toBeUndefined()
  })

  it('should read back the tabs it saved and leave no temporary file beside them', async () => {
    // Arrange
    const store = createSavedTabsFile(file, silentLogger)

    // Act
    await store.save(saved)

    // Assert
    expect(await store.load()).toEqual(saved)
    expect(await readdir(dirname(file))).toEqual(['open-tabs.json'])
  })

  it('should have no tabs when the file is not valid', async () => {
    const store = createSavedTabsFile(file, silentLogger)
    await store.save(saved)
    await writeFile(file, '{"tabs": [{"name": ""}], "active": 0}')

    expect(await store.load()).toBeUndefined()
  })

  it('should have no tabs when the file is not JSON', async () => {
    const store = createSavedTabsFile(file, silentLogger)
    await store.save(saved)
    await writeFile(file, 'not json')

    expect(await store.load()).toBeUndefined()
    expect(await readFile(file, 'utf8')).toBe('not json')
  })
})
