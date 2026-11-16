import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-cli-main-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const dck = (args: readonly string[], profile: string) =>
  spawnSync(process.execPath, [join(import.meta.dirname, 'main.ts'), ...args], {
    env: {
      ...process.env,
      DCK_PROFILE: profile,
      DCK_ENDPOINT: join(directory, 'daemon.sock'),
      DCK_STATE_DIR: directory,
      DCK_CONFIG_DIR: directory,
    },
    encoding: 'utf8',
    timeout: 10_000,
  })

describe('dck entry point', () => {
  it('should exit with 1 before listening when dck daemon gets an invalid DCK_PROFILE', () => {
    const run = dck(['daemon'], 'dev:prod')

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('DCK_PROFILE must be 1 to 64 letters')
    expect(existsSync(join(directory, 'daemon.sock'))).toBe(false)
  })

  it('should ignore DCK_PROFILE when the command does not use the keyring', () => {
    const run = dck(['--help'], 'dev:prod')

    expect(run.status).toBe(0)
    expect(run.stderr).not.toContain('DCK_PROFILE')
  })
})
