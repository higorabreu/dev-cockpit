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
  it('should list only the built-in extension when the config folder is empty', async () => {
    const { code, lines } = await list()

    expect(code).toBe(0)
    expect(lines).toEqual(['dck.built-in  0.3.0  built-in  active'])
  })

  it('should list the global and the repository folders as extensions when each has a standards folder', async () => {
    await mkdir(join(root, 'standards'), { recursive: true })
    await mkdir(join(root, 'project', '.dck', 'standards'), { recursive: true })

    const { lines } = await list()

    expect(lines).toEqual([
      'dck.built-in    0.3.0  built-in    active',
      'dck.global      0.3.0  global      active',
      'dck.repository  0.3.0  repository  active',
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
