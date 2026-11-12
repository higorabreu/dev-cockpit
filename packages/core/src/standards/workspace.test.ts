import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { EXTENSION_API_VERSION } from '../extensions/built-in.ts'
import { type ImplicitSource, implicitManifest } from '../extensions/implicit.ts'
import type { ExtensionCandidate } from '../extensions/load.ts'
import { errorBody } from '../ipc/protocol.ts'
import type { ExtensionFinder } from '../ports/extension-finder.ts'
import { fail, ok } from '../result.ts'
import { MemoryStandardFiles } from '../testing/fakes.ts'
import { checkText } from './check.ts'
import { BUILT_IN_STANDARDS } from './examples.ts'
import { formatStandardFile } from './format.ts'
import { createStandardsWorkspace } from './workspace.ts'

const ROOT = '/home/ana/acme/backend'
const GLOBAL = '/home/ana/.config/dev-cockpit'
const PACK = `${GLOBAL}/extensions/acme.flow`
const AGENTS = `${ROOT}/AGENTS.md`
const CLAUDE = `${ROOT}/CLAUDE.md`
const APP_VERSION = '0.3.0'

const FOLDERS = {
  installed: `${PACK}/standards`,
  global: `${GLOBAL}/standards`,
  repository: `${ROOT}/.dck/standards`,
}

const pack: ExtensionCandidate = {
  source: 'installed',
  location: PACK,
  manifest: {
    id: 'acme.flow',
    name: 'Flow',
    version: '1.0.0',
    apiVersion: EXTENSION_API_VERSION,
    engines: { dck: '>=0.3.0' },
    contributes: { standards: 'standards' },
  },
}

function arrange(disabled: string[] = []) {
  const files = new MemoryStandardFiles(parse)
  const has = (folder: string) => [...files.texts.keys()].some((path) => path.startsWith(folder))
  const implicit = (source: ImplicitSource, location: string): ExtensionCandidate => ({
    source,
    location,
    manifest: implicitManifest({
      source,
      apiVersion: EXTENSION_API_VERSION,
      appVersion: APP_VERSION,
      contributes: { standards: 'standards' },
    }),
  })
  // Like the files adapter: an implicit extension exists only while its standards folder does
  const finder: ExtensionFinder = {
    find: async () => [
      pack,
      ...(has(FOLDERS.global) ? [implicit('global', GLOBAL)] : []),
      ...(has(FOLDERS.repository) ? [implicit('repository', `${ROOT}/.dck`)] : []),
    ],
  }
  const workspace = createStandardsWorkspace({
    finder,
    files,
    disabled: async () => new Set(disabled),
    appVersion: APP_VERSION,
    repositoryRoot: ROOT,
    globalDir: GLOBAL,
    join: (...parts) => parts.join('/'),
  })
  // A file may hold only the fields it changes, as a hand-written override does
  const put = (
    source: keyof typeof FOLDERS,
    { body = '', ...frontMatter }: { id: string; body?: string; [field: string]: unknown },
    name = frontMatter.id,
  ) =>
    files.texts.set(`${FOLDERS[source]}/${name}.md`, `---\n${stringify(frontMatter)}---\n${body}\n`)
  const find = async (id: string) =>
    (await workspace.load()).standards.find((standard) => standard.id === id)
  return { files, workspace, put, find }
}

const builtIn = (id: string) => `built-in/${id}.md`
const sources = (layers: readonly { source: string }[] = []) => layers.map((layer) => layer.source)

describe('createStandardsWorkspace, load', () => {
  it('should give the built-in examples, all disabled, when there is no standard anywhere (C1)', async () => {
    const { workspace } = arrange()

    const { standards, invalid, agents } = await workspace.load()

    expect(invalid).toEqual([])
    expect(standards.map((standard) => [standard.id, standard.enabled])).toEqual([
      ['branch-format', false],
      ['commit-message', false],
      ['mr-description', false],
      ['review-rubric', false],
    ])
    expect(checkText(standards, 'branch', 'Feature/Add_Login')).toEqual([])
    expect(agents).toEqual({
      file: AGENTS,
      shared: false,
      stale: false,
      claudeImportMissing: false,
    })
  })

  it('should let the repository win over the global folder, a pack and the built-in when all declare a standard (C5)', async () => {
    const { put, find } = arrange()
    put('installed', { id: 'branch-format', title: 'Pack title', why: 'Pack reason' })
    put('global', { id: 'branch-format', title: 'Global title', enabled: true })
    put('repository', { id: 'branch-format', title: 'Repository title' })

    const standard = await find('branch-format')

    expect(standard).toMatchObject({
      title: 'Repository title',
      why: 'Pack reason',
      enabled: true,
      applies: 'branch',
    })
    expect(standard?.layers).toEqual([
      { source: 'built-in', extension: 'dck.built-in', path: builtIn('branch-format') },
      {
        source: 'installed',
        extension: 'acme.flow',
        path: `${FOLDERS.installed}/branch-format.md`,
      },
      { source: 'global', extension: 'dck.global', path: `${FOLDERS.global}/branch-format.md` },
      {
        source: 'repository',
        extension: 'dck.repository',
        path: `${FOLDERS.repository}/branch-format.md`,
      },
    ])
  })

  it('should report an invalid repository file with its path when the other standards still load (C6)', async () => {
    const { files, workspace, put } = arrange()
    put('repository', { id: 'commit-message', enabled: true })
    files.texts.set(`${FOLDERS.repository}/broken.md`, '---\nid: [unclosed\n---\nText.\n')
    files.texts.set(`${FOLDERS.repository}/notes.md`, '---\nid: Team Notes\n---\n')

    const { standards, invalid } = await workspace.load()

    expect(invalid.map((entry) => [entry.path, entry.source, entry.error.data?.code])).toEqual([
      [`${FOLDERS.repository}/broken.md`, 'repository', 'DCK-STD-001'],
      [`${FOLDERS.repository}/notes.md`, 'repository', 'DCK-STD-001'],
    ])
    expect(invalid[1]?.error.message).toContain('id: ')
    expect(standards).toHaveLength(BUILT_IN_STANDARDS.length)
    expect(standards.find((standard) => standard.id === 'commit-message')?.enabled).toBe(true)
  })

  it('should take no standard from an extension when the user disabled it', async () => {
    const { workspace, put } = arrange(['acme.flow', 'dck.built-in'])
    put('installed', { id: 'pack-rule', title: 'Pack rule', applies: 'commit', why: 'Shared' })
    put('repository', { id: 'team-rule', title: 'Team rule', applies: 'commit', why: 'Ours' })

    const { standards } = await workspace.load()

    expect(standards.map((standard) => standard.id)).toEqual(['team-rule'])
  })
})

describe('createStandardsWorkspace, changes', () => {
  it('should write the complete standard and show it enabled from the repository when a built-in example is enabled (C2)', async () => {
    const { files, workspace, find } = arrange()
    const example = BUILT_IN_STANDARDS[0]?.standard

    const result = await workspace.setEnabled('branch-format', true, 'repository')

    expect(result).toEqual({ ok: true, value: undefined })
    expect([...files.texts]).toEqual([
      [
        `${FOLDERS.repository}/branch-format.md`,
        example && formatStandardFile({ ...example, enabled: true }),
      ],
    ])
    const standard = await find('branch-format')
    expect(standard?.enabled).toBe(true)
    expect(standard?.layers.at(-1)).toEqual({
      source: 'repository',
      extension: 'dck.repository',
      path: `${FOLDERS.repository}/branch-format.md`,
    })
  })

  it('should change what the check accepts and leave the built-in alone when one field changes (C2)', async () => {
    const { workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    const before = (await workspace.load()).standards

    const result = await workspace.setField(
      'branch-format',
      0,
      'types',
      'feat|hotfix',
      'repository',
    )

    const after = (await workspace.load()).standards
    expect(result.ok).toBe(true)
    expect(checkText(before, 'branch', 'hotfix/add-login')).toHaveLength(1)
    expect(checkText(after, 'branch', 'hotfix/add-login')).toEqual([])
    expect(checkText(after, 'branch', 'fix/add-login')).toHaveLength(1)
    expect(BUILT_IN_STANDARDS[0]?.standard.check[0]?.variables?.types).toContain('fix')
  })

  it('should write to the user folder and keep the repository untouched when the target is global', async () => {
    const { files, workspace, find } = arrange()

    await workspace.setField('commit-message', 1, 'maxLength', 100, 'global')

    expect([...files.texts.keys()]).toEqual([`${FOLDERS.global}/commit-message.md`])
    expect((await find('commit-message'))?.check[1]?.maxLength).toBe(100)
    expect(sources((await find('commit-message'))?.layers)).toEqual(['built-in', 'global'])
  })

  it('should leave the text of the user folder out when a standard is written to the repository', async () => {
    const { files, workspace, put } = arrange()
    put('global', {
      id: 'branch-format',
      title: 'Branch names',
      applies: 'branch',
      paths: [],
      why: 'My own reason',
      enabled: true,
      check: [],
      body: 'My private notes.',
    })

    await workspace.setEnabled('branch-format', true, 'repository')

    const written = files.texts.get(`${FOLDERS.repository}/branch-format.md`) ?? ''
    expect(written).not.toContain('My own reason')
    expect(written).not.toContain('My private notes.')
  })

  it('should leave the text of the repository out when a standard is written to the user folder', async () => {
    const { files, workspace, put } = arrange()
    put('repository', {
      id: 'branch-format',
      title: 'Branch names',
      applies: 'branch',
      paths: [],
      why: 'The team reason',
      enabled: true,
      check: [],
      body: 'Team notes.',
    })

    await workspace.setEnabled('branch-format', false, 'global')

    const written = files.texts.get(`${FOLDERS.global}/branch-format.md`) ?? ''
    expect(written).not.toContain('The team reason')
    expect(written).not.toContain('Team notes.')
  })

  it('should rewrite the file that already holds the standard when it has another name', async () => {
    const { files, workspace, put } = arrange()
    put('repository', { id: 'branch-format', title: 'Our branches' }, 'branches')

    await workspace.setEnabled('branch-format', true, 'repository')

    expect([...files.texts.keys()]).toEqual([`${FOLDERS.repository}/branches.md`])
    expect(files.texts.get(`${FOLDERS.repository}/branches.md`)).toContain("title: 'Our branches'")
    expect(files.texts.get(`${FOLDERS.repository}/branches.md`)).toContain('enabled: true')
  })

  it.each([
    ['an invalid file', '---\nid: Broken Id\n---\nOur notes.\n'],
    ['another standard', '---\nid: our-branches\ntitle: Ours\napplies: branch\nwhy: Ours\n---\n'],
  ])(
    'should fail with DCK-STD-001 and keep the file when the default name holds %s',
    async (_case, text) => {
      const { files, workspace } = arrange()
      const path = `${FOLDERS.repository}/branch-format.md`
      files.texts.set(path, text)

      const result = await workspace.setEnabled('branch-format', true, 'repository')

      expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-STD-001' } } })
      expect(result.ok ? '' : result.error.message).toContain(path)
      expect(files.texts.get(path)).toBe(text)
    },
  )

  it('should name the file a change is written to when asked before the change', async () => {
    const { workspace, put } = arrange()
    put('repository', { id: 'branch-format', title: 'Our branches' }, 'branches')
    const { standards } = await workspace.load()

    const files = standards.map((standard) => workspace.fileFor(standard, 'repository'))
    const global = standards.map((standard) => workspace.fileFor(standard, 'global'))

    expect(files.slice(0, 2)).toEqual([
      `${FOLDERS.repository}/branches.md`,
      `${FOLDERS.repository}/commit-message.md`,
    ])
    expect(global[0]).toBe(`${FOLDERS.global}/branch-format.md`)
  })

  it.each([
    ['the field does not exist', 'branch-format', 0, 'ticket', 'feat'],
    ['the value breaks the rule', 'branch-format', 0, 'types', 'feat|(fix'],
  ] as const)(
    'should fail with DCK-STD-001 and write nothing when %s',
    async (_case, id, rule, name, value) => {
      const { files, workspace } = arrange()

      const result = await workspace.setField(id, rule, name, value, 'repository')

      expect(result.ok ? undefined : result.error.data?.code).toBe('DCK-STD-001')
      expect(files.texts.size).toBe(0)
    },
  )

  it('should fail with DCK-STD-005 when enabling a standard that does not exist', async () => {
    const { workspace } = arrange()

    const result = await workspace.setEnabled('no-such-standard', true, 'repository')

    expect(result.ok ? undefined : result.error.data?.code).toBe('DCK-STD-005')
  })
})

describe('createStandardsWorkspace, agents', () => {
  const ORIGINAL = '# Backend\n\nRun the tests before a commit.\n'

  it('should write the same bytes and keep the text around the block when sharing twice', async () => {
    const { files, workspace } = arrange()
    files.texts.set(AGENTS, ORIGINAL)
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.setEnabled('commit-message', true, 'repository')

    await workspace.shareWithAgents(true)
    const first = files.texts.get(AGENTS)
    await workspace.shareWithAgents(true)

    expect(files.texts.get(AGENTS)).toBe(first)
    expect(first).toBe(
      `${ORIGINAL}
<!-- dck:start -->
## Standards to follow in this repository

- Branch names: Use <type>/<short-slug> in lowercase with a type from feat, fix, docs, refactor, test, chore, ci, for example feat/add-login
- Commit messages: Start with <type>(<optional scope>): <summary> with a type from feat, fix, docs, refactor, test, chore, ci, for example fix(cli): handle empty input; Keep the first line within 72 characters
<!-- dck:end -->
`,
    )
    expect((await workspace.load()).agents).toMatchObject({ shared: true, stale: false })
  })

  it('should leave a standard out of the block when only the user folder switched it on', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.setEnabled('commit-message', true, 'global')

    await workspace.shareWithAgents(true)

    const text = files.texts.get(AGENTS) ?? ''
    expect(text).toContain('- Branch names:')
    expect(text).not.toContain('- Commit messages:')
  })

  it('should write nothing and fail with DCK-STD-004 when only the user folder switched a standard on', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('commit-message', true, 'global')

    const result = await workspace.shareWithAgents(true)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-STD-004' } } })
    expect(files.texts.has(AGENTS)).toBe(false)
  })

  it('should restore the original text when sharing is turned off', async () => {
    const { files, workspace } = arrange()
    files.texts.set(AGENTS, ORIGINAL)
    await workspace.setEnabled('review-rubric', true, 'repository')
    await workspace.shareWithAgents(true)

    await workspace.shareWithAgents(false)

    expect(files.texts.get(AGENTS)).toBe(ORIGINAL)
    expect((await workspace.load()).agents).toMatchObject({ shared: false, stale: false })
  })

  it('should create the file when sharing and leave it empty, not deleted, when turned off again', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('review-rubric', true, 'repository')

    await workspace.shareWithAgents(true)
    const created = files.texts.get(AGENTS)
    await workspace.shareWithAgents(false)

    expect(created).toContain('  Details: `dck guide review`\n<!-- dck:end -->\n')
    expect(files.texts.get(AGENTS)).toBe('')
  })

  it('should change nothing and pass the failure on when AGENTS.md cannot be read', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    const refusal = fail(
      errorBody('DCK-STD-002', `${AGENTS}: not a regular file of at most 256 KB`),
    )
    files.readText = async () => refusal
    const written: string[] = []
    files.writeText = async (path) => {
      written.push(path)
      return ok(undefined)
    }

    const result = await workspace.shareWithAgents(true)

    expect(result).toBe(refusal)
    expect(written).toEqual([])
  })

  it('should write under the repository root so a link on the way is refused', async () => {
    const { files, workspace } = arrange()
    const roots: string[] = []
    files.writeText = async (_path, _text, root) => {
      roots.push(root)
      return ok(undefined)
    }

    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.setEnabled('commit-message', true, 'global')

    expect(roots).toEqual([ROOT, GLOBAL])
  })

  it('should not create the file when sharing is turned off and it does not exist', async () => {
    const { files, workspace } = arrange()

    await workspace.shareWithAgents(false)

    expect(files.texts.has(AGENTS)).toBe(false)
  })

  it('should report a stale block when a standard changes after sharing, until it is shared again', async () => {
    const { workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)

    await workspace.setEnabled('commit-message', true, 'repository')
    const changed = (await workspace.load()).agents
    await workspace.shareWithAgents(true)

    expect(changed).toMatchObject({ shared: true, stale: true })
    expect((await workspace.load()).agents).toMatchObject({ shared: true, stale: false })
  })

  it.each([
    ['no CLAUDE.md exists', undefined, false],
    ['CLAUDE.md does not import the file', '# Claude\n', true],
    ['CLAUDE.md imports the file', '@AGENTS.md\n\n## Claude Code\n', false],
    ['CLAUDE.md imports the file with ./', '# Claude\r\n@./AGENTS.md\r\n', false],
    ['CLAUDE.md imports the file within a sentence', 'Read @AGENTS.md first.\n', false],
    ['CLAUDE.md imports another file', '@AGENTS.md.bak\n', true],
  ])('should tell whether the Claude import is missing when %s', async (_case, text, missing) => {
    const { files, workspace } = arrange()
    if (text !== undefined) files.texts.set(CLAUDE, text)

    const { agents } = await workspace.load()

    expect(agents.claudeImportMissing).toBe(missing)
  })

  it('should not report the block as stale when only the text around it or its line endings differ', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)
    const shared = files.texts.get(AGENTS) ?? ''
    files.texts.set(
      AGENTS,
      `# Agents\r\n\r\n${shared.trimEnd().replaceAll('\n', '\r\n')}\r\n\r\n\r\n## Mine`,
    )

    const { agents } = await workspace.load()

    expect(agents).toMatchObject({ shared: true, stale: false })
  })

  it('should append the import to an existing CLAUDE.md once when it lacks it', async () => {
    const { files, workspace } = arrange()
    files.texts.set(CLAUDE, '# Claude\n\nPersonal notes go elsewhere.')

    await workspace.addClaudeImport()
    await workspace.addClaudeImport()

    expect(files.texts.get(CLAUDE)).toBe('# Claude\n\nPersonal notes go elsewhere.\n@AGENTS.md\n')
    expect((await workspace.load()).agents.claudeImportMissing).toBe(false)
  })

  it('should not create a CLAUDE.md when adding the import and none exists', async () => {
    const { files, workspace } = arrange()

    await workspace.addClaudeImport()

    expect(files.texts.has(CLAUDE)).toBe(false)
  })
})
