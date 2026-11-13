import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTranslator, silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCli } from './cli.ts'
import { createExtDeps } from './ext-deps.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-ext-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const manifest = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  version: '1.0.0',
  apiVersion: 1,
  engines: { dck: '>=0.2.0' },
  ...overrides,
})

async function install(folder: string, content: string) {
  await mkdir(join(root, 'extensions', folder), { recursive: true })
  await writeFile(join(root, 'extensions', folder, 'dck-extension.json'), content)
}

const deps = () =>
  createExtDeps({
    configDir: root,
    repositoryRoot: join(root, 'project'),
    appVersion: '0.3.0',
    logger: silentLogger,
    readFile: (path) => readFile(path, 'utf8').catch(() => undefined),
    writeFile: async (path, text) => {
      await writeFile(path, text)
      return true
    },
  })

async function list() {
  const out: string[] = []
  const code = await runCli(['ext', 'list'], {
    endpoint: '',
    t: createTranslator('en').t,
    connect: () => Promise.reject(new Error('invariant: ext list must not reach the daemon')),
    out: (text) => out.push(text),
    err: (text) => out.push(text),
    ext: deps(),
  })
  return { code, lines: out.join('').trimEnd().split('\n') }
}

describe('createExtDeps', () => {
  it('should list only the built-in extensions when the config folder is empty', async () => {
    const { code, lines } = await list()

    expect(code).toBe(0)
    expect(lines).toEqual([
      'dck.built-in  0.3.0  built-in  active',
      'dck.gitlab    0.3.0  built-in  active',
    ])
  })

  it('should show an installed extension as disabled when the settings file lists its id', async () => {
    await install('acme.commits', JSON.stringify(manifest('acme.commits')))
    await install('acme.reviews', JSON.stringify(manifest('acme.reviews')))
    await writeFile(
      join(root, 'settings.json'),
      JSON.stringify({ extensions: { disabled: ['acme.reviews'] } }),
    )

    const { lines } = await list()

    expect(lines).toEqual([
      'dck.built-in  0.3.0  built-in   active',
      'dck.gitlab    0.3.0  built-in   active',
      'acme.commits  1.0.0  installed  active',
      'acme.reviews  1.0.0  installed  disabled',
    ])
  })

  it('should report a broken manifest with its folder when another extension still loads', async () => {
    await install('acme.commits', JSON.stringify(manifest('acme.commits')))
    await install('broken', '{ not json')

    const { code, lines } = await list()

    expect(code).toBe(0)
    expect(lines).toContain('acme.commits  1.0.0  installed  active')
    expect(lines.at(-1)).toContain(join(root, 'extensions', 'broken'))
    expect(lines.at(-1)).toContain('Invalid extension manifest')
  })

  it('should disable nothing when the settings file is not valid json', async () => {
    await writeFile(join(root, 'settings.json'), '{ broken')

    expect(await deps().disabled()).toEqual(new Set())
  })
})

describe('createExtDeps saveDisabled', () => {
  const settingsFile = () => join(root, 'settings.json')

  it('should change only the disabled list and keep the account when saving', async () => {
    const before = {
      theme: 'light',
      connections: { gitlab: { url: 'https://gitlab.example.com' } },
    }
    await writeFile(settingsFile(), JSON.stringify(before))

    const result = await deps().saveDisabled(new Set(['dck.gitlab']))

    const after = JSON.parse(await readFile(settingsFile(), 'utf8'))
    expect(result).toEqual({ kind: 'saved' })
    expect(after.extensions.disabled).toEqual(['dck.gitlab'])
    expect(after.theme).toBe('light')
    expect(after.connections).toEqual(before.connections)
  })

  it('should write the list when there is no settings file yet', async () => {
    const result = await deps().saveDisabled(new Set(['dck.gitlab']))

    expect(result).toEqual({ kind: 'saved' })
    expect(await deps().disabled()).toEqual(new Set(['dck.gitlab']))
  })

  it('should leave a settings file that is not valid json untouched', async () => {
    await writeFile(settingsFile(), '{ broken')

    const result = await deps().saveDisabled(new Set(['dck.gitlab']))

    expect(result).toEqual({ kind: 'invalid', file: settingsFile() })
    expect(await readFile(settingsFile(), 'utf8')).toBe('{ broken')
  })

  it('should show the connector disabled in the listing and active again after it is enabled', async () => {
    const run = async (args: string[]) => {
      const out: string[] = []
      await runCli(args, {
        endpoint: '',
        t: createTranslator('en').t,
        connect: () => Promise.reject(new Error('invariant: ext must not reach the daemon')),
        out: (text) => out.push(text),
        err: (text) => out.push(text),
        ext: deps(),
      })
      return out.join('')
    }

    await run(['ext', 'disable', 'dck.gitlab'])
    const disabled = await run(['ext', 'list'])
    await run(['ext', 'enable', 'dck.gitlab'])
    const enabled = await run(['ext', 'list'])

    expect(disabled).toContain('dck.gitlab    0.3.0  built-in  disabled')
    expect(enabled).toContain('dck.gitlab    0.3.0  built-in  active')
  })
})
