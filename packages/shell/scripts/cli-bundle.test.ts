import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildCli } from './cli-bundle.mjs'

let resources = ''

beforeAll(async () => {
  resources = mkdtempSync(join(tmpdir(), 'dck-cli-bundle-'))
  await buildCli(join(resources, 'dck.mjs'))
}, 30_000)

afterAll(() => rmSync(resources, { recursive: true, force: true }))

const dck = (args: readonly string[]) =>
  spawnSync(process.execPath, [join(resources, 'dck.mjs'), ...args], {
    env: {
      PATH: process.env.PATH,
      LANG: 'en_US.UTF-8',
      DCK_ENDPOINT: join(resources, 'run', 'daemon.sock'),
      DCK_CONFIG_DIR: join(resources, 'config'),
    },
    encoding: 'utf8',
    timeout: 10_000,
  })

describe('buildCli', () => {
  it('should keep zod classic, the settings and the catalogs out of the entry when bundling the CLI', () => {
    // Arrange
    const entry = readFileSync(join(resources, 'dck.mjs'), 'utf8')

    // Act
    const loaded = ['zod/v4/classic/', 'i18n/pt-BR.ts', 'settings/settings.ts', 'adapters/jsonc/']

    // Assert
    expect(loaded.filter((path) => entry.includes(path))).toEqual([])
    expect(readdirSync(join(resources, 'cli'))).toEqual(
      expect.arrayContaining(['daemon-process.mjs', 'full-cli.mjs']),
    )
  })

  it('should load the rest from cli/ when a command needs it', () => {
    const run = dck(['--help'])

    expect(run.status).toBe(0)
    expect(run.stderr).toContain('Usage: dck <command>')
  })

  it('should explain the failure when toggle finds no daemon', () => {
    const run = dck(['toggle'])

    expect(run.status).toBe(69)
    expect(run.stderr).toBe('Could not talk to the daemon\nStart the daemon with: dck daemon\n')
  })
})
