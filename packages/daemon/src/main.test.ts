import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-daemon-main-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('daemon entry point', () => {
  it('should exit with 1 before listening when DCK_PROFILE is not valid', () => {
    const endpoint = join(directory, 'daemon.sock')

    const run = spawnSync(process.execPath, [join(import.meta.dirname, 'main.ts')], {
      env: {
        ...process.env,
        DCK_PROFILE: 'my profile',
        DCK_ENDPOINT: endpoint,
        DCK_STATE_DIR: directory,
      },
      encoding: 'utf8',
      timeout: 10_000,
    })

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('DCK_PROFILE must be 1 to 64 letters')
    expect(existsSync(endpoint)).toBe(false)
  })
})
