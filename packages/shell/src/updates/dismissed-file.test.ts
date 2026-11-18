import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDismissedFile } from './dismissed-file.ts'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-dismissed-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('loadDismissedFile', () => {
  it('should know no version when there is no file', async () => {
    const store = await loadDismissedFile(join(directory, 'updates.json'), silentLogger)

    expect(store.get()).toBeUndefined()
  })

  it('should keep the version for the next run when the user dismisses it', async () => {
    const file = join(directory, 'updates.json')
    const store = await loadDismissedFile(file, silentLogger)

    store.set('0.10.0')
    await settle()

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ dismissed: '0.10.0' })
    expect((await loadDismissedFile(file, silentLogger)).get()).toBe('0.10.0')
  })

  it('should ignore the file and warn when it does not hold a version', async () => {
    const file = join(directory, 'updates.json')
    await writeFile(file, '{"dismissed":"soon"}')
    const warnings: string[] = []

    const store = await loadDismissedFile(file, {
      ...silentLogger,
      warn: (message) => void warnings.push(message),
    })

    expect(store.get()).toBeUndefined()
    expect(warnings).toEqual(['update state invalid, ignored'])
  })
})
