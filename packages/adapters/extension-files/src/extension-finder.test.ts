import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  contributionsFor,
  defineContributionPoint,
  type ExtensionCandidate,
  type Logger,
  loadExtensions,
} from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createFileExtensionFinder,
  type ExtensionFiles,
  type FileExtensionFinderOptions,
  findRepositoryRoot,
  MANIFEST_FILE,
} from './extension-finder.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-extensions-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const folder = async (...parts: string[]) => {
  const path = join(root, ...parts)
  await mkdir(path, { recursive: true })
  return path
}

const manifestFor = (id: string, contributes: Record<string, unknown> = {}) => ({
  id,
  name: id,
  version: '1.0.0',
  apiVersion: 1,
  engines: { dck: '>=0.3.0' },
  contributes,
})

const install = async (name: string, content: unknown) => {
  const location = await folder('extensions', name)
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  await writeFile(join(location, MANIFEST_FILE), text)
  return location
}

const finder = (overrides: Partial<FileExtensionFinderOptions> = {}) =>
  createFileExtensionFinder({
    installedDir: join(root, 'extensions'),
    globalDir: join(root, 'global'),
    repositoryDir: join(root, 'backend', '.dck'),
    implicit: { apiVersion: 1, appVersion: '0.3.0', points: { rules: 'rules' } },
    ...overrides,
  })

function recordingLogger() {
  const warnings: { message: string; context: unknown }[] = []
  const logger: Logger = {
    info() {},
    warn: (message, context) => void warnings.push({ message, context }),
    error() {},
  }
  return { logger, warnings }
}

describe('findRepositoryRoot', () => {
  it('should find the folder with .git when the directory is a subfolder of the repository', async () => {
    await folder('backend', '.git')
    const deep = await folder('backend', 'packages', 'api')

    expect(await findRepositoryRoot(deep)).toBe(join(root, 'backend'))
  })

  it('should accept a .git file when the repository is a linked worktree', async () => {
    const worktree = await folder('backend-fix')
    await writeFile(join(worktree, '.git'), 'gitdir: /home/ana/backend/.git/worktrees/fix')

    expect(await findRepositoryRoot(worktree)).toBe(worktree)
  })

  it('should be undefined when no folder above has .git', async () => {
    const outside = await folder('notes')
    const never = { readDir: async () => [], readFile: async () => undefined }

    expect(await findRepositoryRoot(outside, never)).toBeUndefined()
  })
})

describe('createFileExtensionFinder, installed', () => {
  it('should list each subfolder with a manifest when the extensions folder has several', async () => {
    const commits = await install('acme.commits', manifestFor('acme.commits'))
    const reviews = await install('acme.reviews', manifestFor('acme.reviews'))

    const candidates = await finder().find()

    expect(candidates).toEqual([
      { source: 'installed', location: commits, manifest: manifestFor('acme.commits') },
      { source: 'installed', location: reviews, manifest: manifestFor('acme.reviews') },
    ])
  })

  it('should return the folders sorted by name when the file system lists them in another order', async () => {
    const fs: ExtensionFiles = {
      readDir: async (path) =>
        path === 'extensions'
          ? [
              { name: 'zeta', isDirectory: true },
              { name: 'Beta', isDirectory: true },
              { name: 'alpha', isDirectory: true },
            ]
          : path.startsWith('extensions')
            ? [{ name: MANIFEST_FILE, isDirectory: false }]
            : undefined,
      readFile: async () => '{}',
    }

    const candidates = await finder({ installedDir: 'extensions', fs }).find()

    expect(candidates.map((candidate) => candidate.location)).toEqual([
      join('extensions', 'Beta'),
      join('extensions', 'alpha'),
      join('extensions', 'zeta'),
    ])
  })

  it('should skip a subfolder silently when it has no manifest file', async () => {
    await folder('extensions', 'notes')
    await writeFile(join(root, 'extensions', 'readme.txt'), 'not an extension')
    const { logger, warnings } = recordingLogger()

    const candidates = await finder({ logger }).find()

    expect(candidates).toEqual([])
    expect(warnings).toEqual([])
  })

  it('should find nothing when the extensions folder does not exist', async () => {
    expect(await finder().find()).toEqual([])
  })

  it('should read the manifest when the file starts with a byte order mark', async () => {
    const location = await install('acme.commits', '\uFEFF{ "id": "acme.commits" }')

    const candidates = await finder().find()

    expect(candidates).toEqual([
      { source: 'installed', location, manifest: { id: 'acme.commits' } },
    ])
  })

  it('should keep the candidate and warn when the manifest is not valid json', async () => {
    const location = await install('acme.broken', '{ "id": ')
    const { logger, warnings } = recordingLogger()

    const candidates = await finder({ logger }).find()

    expect(candidates).toEqual([{ source: 'installed', location, manifest: undefined }])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toBe('extension manifest is not valid json')
    expect(warnings[0]?.context).toMatchObject({ file: join(location, MANIFEST_FILE) })
  })

  it('should keep the candidate and warn when the manifest cannot be read', async () => {
    // A folder where the file should be: listed, but reading it fails on every system
    const location = await folder('extensions', 'acme.locked')
    await mkdir(join(location, MANIFEST_FILE))
    const { logger, warnings } = recordingLogger()

    const candidates = await finder({ logger }).find()

    expect(candidates).toEqual([{ source: 'installed', location, manifest: undefined }])
    expect(warnings).toEqual([
      {
        message: 'extension manifest unreadable',
        context: { file: join(location, MANIFEST_FILE) },
      },
    ])
  })

  it('should follow a linked folder when an extension under development is linked in', async () => {
    const source = await folder('work', 'commits')
    await writeFile(join(source, MANIFEST_FILE), JSON.stringify(manifestFor('acme.commits')))
    await folder('extensions')
    await symlink(source, join(root, 'extensions', 'acme.commits'), 'junction')

    const candidates = await finder().find()

    expect(candidates).toEqual([
      {
        source: 'installed',
        location: join(root, 'extensions', 'acme.commits'),
        manifest: manifestFor('acme.commits'),
      },
    ])
  })
})

describe('createFileExtensionFinder, implicit', () => {
  it('should emit one implicit candidate per folder when global and repository hold a known point', async () => {
    await folder('global', 'rules')
    await folder('backend', '.dck', 'rules')

    const candidates = await finder().find()

    expect(candidates).toEqual([
      {
        source: 'global',
        location: join(root, 'global'),
        manifest: expect.objectContaining({
          id: 'dck.global',
          contributes: { rules: 'rules' },
        }),
      },
      {
        source: 'repository',
        location: join(root, 'backend', '.dck'),
        manifest: expect.objectContaining({
          id: 'dck.repository',
          contributes: { rules: 'rules' },
        }),
      },
    ])
  })

  it('should contribute only the points whose folder exists when several are known', async () => {
    await folder('global', 'rules')
    // A file with the name of a point is not its folder
    await writeFile(join(root, 'global', 'themes'), '')
    const points = { rules: 'rules', themes: 'themes', sections: 'sections' }

    const candidates = await finder({
      implicit: { apiVersion: 1, appVersion: '0.3.0', points },
    }).find()

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.manifest).toMatchObject({ contributes: { rules: 'rules' } })
  })

  it('should not emit an implicit candidate when the folder exists but holds no known point', async () => {
    await folder('global', 'unrelated')
    await folder('backend', '.dck')

    expect(await finder().find()).toEqual([])
  })

  it('should not emit an implicit candidate when the options name no point', async () => {
    await folder('global', 'rules')

    const candidates = await finder({
      implicit: { apiVersion: 1, appVersion: '0.3.0', points: {} },
    }).find()

    expect(candidates).toEqual([])
  })

  it('should look only at the global folder when there is no repository folder', async () => {
    await folder('global', 'rules')
    await folder('backend', '.dck', 'rules')

    const candidates = await finder({ repositoryDir: undefined }).find()

    expect(candidates.map((candidate) => candidate.source)).toEqual(['global'])
  })
})

describe('createFileExtensionFinder with loadExtensions (F2)', () => {
  const rules = defineContributionPoint('rules', z.string())

  const arrange = async () => {
    const installedCommits = await install(
      'acme.commits',
      manifestFor('acme.commits', { rules: 'installed/' }),
    )
    await install('acme.reviews', manifestFor('acme.reviews', { rules: 'reviews/' }))
    const broken = await install('acme.broken', '{ nope')
    const needsCode = await install('acme.runner', { ...manifestFor('acme.runner'), main: 'x.js' })
    await folder('global', 'rules')
    await folder('backend', '.dck', 'rules')
    const builtIn: ExtensionCandidate[] = [
      {
        source: 'built-in',
        location: '/opt/dck/extensions/dck.harness',
        manifest: manifestFor('dck.harness', { rules: 'harness/' }),
      },
      {
        source: 'built-in',
        location: '/opt/dck/extensions/acme.commits',
        manifest: manifestFor('acme.commits', { rules: 'built-in/' }),
      },
    ]
    return { builtIn, installedCommits, broken, needsCode }
  }

  const load = (candidates: readonly ExtensionCandidate[], disabled: readonly string[] = []) =>
    loadExtensions({
      candidates,
      points: [rules],
      disabled: new Set(disabled),
      apiVersion: 1,
      appVersion: '0.3.0',
    })

  it('should order the extensions by precedence when they come from the four sources', async () => {
    const { builtIn } = await arrange()

    const report = load([...(await finder().find()), ...builtIn])

    expect(report.active.map(({ source, manifest }) => [source, manifest.id])).toEqual([
      ['built-in', 'dck.harness'],
      ['installed', 'acme.commits'],
      ['installed', 'acme.reviews'],
      ['global', 'dck.global'],
      ['repository', 'dck.repository'],
    ])
  })

  it('should list the built-in one as shadowed when an installed extension has the same id', async () => {
    const { builtIn, installedCommits } = await arrange()

    const report = load([...builtIn, ...(await finder().find())])

    expect(
      report.shadowed.map(({ extension, by }) => ({
        id: extension.manifest.id,
        from: extension.source,
        by: by.source,
        at: by.location,
      })),
    ).toEqual([{ id: 'acme.commits', from: 'built-in', by: 'installed', at: installedCommits }])
    expect(contributionsFor(report, rules).map((entry) => entry.declaration)).toEqual([
      'harness/',
      'installed/',
      'reviews/',
      'rules',
      'rules',
    ])
  })

  it('should reject an invalid manifest with its location when the others load', async () => {
    const { builtIn, broken, needsCode } = await arrange()

    const report = load([...builtIn, ...(await finder().find())])

    expect(
      report.rejected.map(({ source, location, error }) => [source, location, error.data?.code]),
    ).toEqual([
      ['installed', broken, 'DCK-EXT-001'],
      ['installed', needsCode, 'DCK-EXT-002'],
    ])
    expect(report.active).toHaveLength(5)
  })

  it('should contribute nothing from an extension when its id is disabled', async () => {
    const { builtIn } = await arrange()

    const report = load([...builtIn, ...(await finder().find())], ['acme.reviews', 'dck.global'])

    expect(report.disabled.map((extension) => extension.manifest.id)).toEqual([
      'acme.reviews',
      'dck.global',
    ])
    expect(contributionsFor(report, rules).map((entry) => entry.extension.manifest.id)).toEqual([
      'dck.harness',
      'acme.commits',
      'dck.repository',
    ])
  })
})
