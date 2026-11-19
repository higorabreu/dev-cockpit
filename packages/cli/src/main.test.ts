import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-cli-main-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const dck = (args: readonly string[], profile: string, locale: Record<string, string> = {}) =>
  spawnSync(process.execPath, [join(import.meta.dirname, 'main.ts'), ...args], {
    env: {
      ...process.env,
      LANGUAGE: '',
      LC_ALL: '',
      LC_MESSAGES: '',
      LANG: '',
      ...locale,
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

  it('should answer in the language chosen in settings when the terminal speaks another', async () => {
    // Arrange
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ language: 'pt-BR' }))

    // Act
    const run = dck(['--help'], '', { LANG: 'en_US.UTF-8' })

    // Assert
    expect(run.stderr).toContain('Uso: dck <comando>')
  })

  it('should follow the terminal when the language in settings is automatic', () => {
    const run = dck(['--help'], '', { LANG: 'pt_BR.UTF-8' })

    expect(run.stderr).toContain('Uso: dck <comando>')
  })

  it('should report a missing daemon in the language chosen in settings when toggle fails', async () => {
    // Arrange
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ language: 'pt-BR' }))

    // Act
    const run = dck(['toggle'], '', { LANG: 'en_US.UTF-8' })

    // Assert
    expect(run.status).toBe(69)
    expect(run.stderr).toContain('Inicie o daemon com: dck daemon')
  })

  it('should answer in english when the terminal speaks a language with no catalog', () => {
    const run = dck(['--help'], '', { LANG: 'de_DE.UTF-8' })

    expect(run.stderr).toContain('Usage: dck <command>')
  })
})
