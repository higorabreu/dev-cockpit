import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { EXTENSION_API_VERSION } from '../extensions/built-in.ts'
import { type ImplicitSource, implicitManifest } from '../extensions/implicit.ts'
import type { ExtensionCandidate } from '../extensions/load.ts'
import { errorBody } from '../ipc/protocol.ts'
import type { ExtensionFinder } from '../ports/extension-finder.ts'
import { fail, ok } from '../result.ts'
import { MemoryRuleFiles } from '../testing/fakes.ts'
import { checkText } from './check.ts'
import { BUILT_IN_RULES } from './examples.ts'
import { formatRuleFile } from './format.ts'
import { createRulesWorkspace } from './workspace.ts'

const ROOT = '/home/ana/acme/backend'
const GLOBAL = '/home/ana/.config/dev-cockpit'
const PACK = `${GLOBAL}/extensions/acme.flow`
const AGENTS = `${ROOT}/AGENTS.md`
const CLAUDE = `${ROOT}/CLAUDE.md`
const APP_VERSION = '0.3.0'

const FOLDERS = {
  installed: `${PACK}/rules`,
  global: `${GLOBAL}/rules`,
  repository: `${ROOT}/.dck/rules`,
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
    contributes: { rules: 'rules' },
  },
}

function arrange(disabled: string[] = []) {
  const files = new MemoryRuleFiles(parse)
  const has = (folder: string) => [...files.texts.keys()].some((path) => path.startsWith(folder))
  const implicit = (source: ImplicitSource, location: string): ExtensionCandidate => ({
    source,
    location,
    manifest: implicitManifest({
      source,
      apiVersion: EXTENSION_API_VERSION,
      appVersion: APP_VERSION,
      contributes: { rules: 'rules' },
    }),
  })
  // Like the files adapter: an implicit extension exists only while its rules folder does
  const finder: ExtensionFinder = {
    find: async () => [
      pack,
      ...(has(FOLDERS.global) ? [implicit('global', GLOBAL)] : []),
      ...(has(FOLDERS.repository) ? [implicit('repository', `${ROOT}/.dck`)] : []),
    ],
  }
  const workspace = createRulesWorkspace({
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
  const find = async (id: string) => (await workspace.load()).rules.find((rule) => rule.id === id)
  return { files, workspace, put, find }
}

const builtIn = (id: string) => `built-in/${id}.md`
const sources = (layers: readonly { source: string }[] = []) => layers.map((layer) => layer.source)

describe('createRulesWorkspace, load', () => {
  it('should give the built-in examples, all disabled, when there is no rule anywhere (C1)', async () => {
    const { workspace } = arrange()

    const { rules, invalid, agents } = await workspace.load()

    expect(invalid).toEqual([])
    expect(rules.map((rule) => [rule.id, rule.enabled])).toEqual([
      ['branch-format', false],
      ['commit-message', false],
      ['mr-description', false],
      ['review-rubric', false],
    ])
    expect(checkText(rules, 'branch', 'Feature/Add_Login')).toEqual([])
    expect(agents).toEqual({
      file: AGENTS,
      shared: false,
      stale: false,
      claudeImportMissing: false,
    })
  })

  it('should let the repository win over the global folder, a pack and the built-in when all declare a rule (C5)', async () => {
    const { put, find } = arrange()
    put('installed', { id: 'branch-format', title: 'Pack title', why: 'Pack reason' })
    put('global', { id: 'branch-format', title: 'Global title', enabled: true })
    put('repository', { id: 'branch-format', title: 'Repository title' })

    const rule = await find('branch-format')

    expect(rule).toMatchObject({
      title: 'Repository title',
      why: 'Pack reason',
      enabled: true,
      applies: 'branch',
    })
    expect(rule?.layers).toEqual([
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

  it('should report an invalid repository file with its path when the other rules still load (C6)', async () => {
    const { files, workspace, put } = arrange()
    put('repository', { id: 'commit-message', enabled: true })
    files.texts.set(`${FOLDERS.repository}/broken.md`, '---\nid: [unclosed\n---\nText.\n')
    files.texts.set(`${FOLDERS.repository}/notes.md`, '---\nid: Team Notes\n---\n')

    const { rules, invalid } = await workspace.load()

    expect(invalid.map((entry) => [entry.path, entry.source, entry.error.data?.code])).toEqual([
      [`${FOLDERS.repository}/broken.md`, 'repository', 'DCK-RUL-001'],
      [`${FOLDERS.repository}/notes.md`, 'repository', 'DCK-RUL-001'],
    ])
    expect(invalid[1]?.error.message).toContain('id: ')
    expect(rules).toHaveLength(BUILT_IN_RULES.length)
    expect(rules.find((rule) => rule.id === 'commit-message')?.enabled).toBe(true)
  })

  it('should take no rule from an extension when the user disabled it', async () => {
    const { workspace, put } = arrange(['acme.flow', 'dck.built-in'])
    put('installed', { id: 'pack-check', title: 'Pack check', applies: 'commit', why: 'Shared' })
    put('repository', { id: 'team-check', title: 'Team check', applies: 'commit', why: 'Ours' })

    const { rules } = await workspace.load()

    expect(rules.map((rule) => rule.id)).toEqual(['team-check'])
  })
})

describe('createRulesWorkspace, changes', () => {
  it('should write the complete rule and show it enabled from the repository when a built-in example is enabled (C2)', async () => {
    const { files, workspace, find } = arrange()
    const example = BUILT_IN_RULES[0]?.rule

    const result = await workspace.setEnabled('branch-format', true, 'repository')

    expect(result).toEqual({ ok: true, value: undefined })
    expect([...files.texts]).toEqual([
      [
        `${FOLDERS.repository}/branch-format.md`,
        example && formatRuleFile({ ...example, enabled: true }),
      ],
    ])
    const rule = await find('branch-format')
    expect(rule?.enabled).toBe(true)
    expect(rule?.layers.at(-1)).toEqual({
      source: 'repository',
      extension: 'dck.repository',
      path: `${FOLDERS.repository}/branch-format.md`,
    })
  })

  it('should change what the check accepts and leave the built-in alone when one field changes (C2)', async () => {
    const { workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    const before = (await workspace.load()).rules

    const result = await workspace.setField(
      'branch-format',
      0,
      'types',
      'feat|hotfix',
      'repository',
    )

    const after = (await workspace.load()).rules
    expect(result.ok).toBe(true)
    expect(checkText(before, 'branch', 'hotfix/add-login')).toHaveLength(1)
    expect(checkText(after, 'branch', 'hotfix/add-login')).toEqual([])
    expect(checkText(after, 'branch', 'fix/add-login')).toHaveLength(1)
    expect(BUILT_IN_RULES[0]?.rule.check[0]?.variables?.types).toContain('fix')
  })

  it('should write to the user folder and keep the repository untouched when the target is global', async () => {
    const { files, workspace, find } = arrange()

    await workspace.setField('commit-message', 1, 'maxLength', 100, 'global')

    expect([...files.texts.keys()]).toEqual([`${FOLDERS.global}/commit-message.md`])
    expect((await find('commit-message'))?.check[1]?.maxLength).toBe(100)
    expect(sources((await find('commit-message'))?.layers)).toEqual(['built-in', 'global'])
  })

  it('should leave the text of the user folder out when a rule is written to the repository', async () => {
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

  it('should leave the text of the repository out when a rule is written to the user folder', async () => {
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

  it('should rewrite the file that already holds the rule when it has another name', async () => {
    const { files, workspace, put } = arrange()
    put('repository', { id: 'branch-format', title: 'Our branches' }, 'branches')

    await workspace.setEnabled('branch-format', true, 'repository')

    expect([...files.texts.keys()]).toEqual([`${FOLDERS.repository}/branches.md`])
    expect(files.texts.get(`${FOLDERS.repository}/branches.md`)).toContain("title: 'Our branches'")
    expect(files.texts.get(`${FOLDERS.repository}/branches.md`)).toContain('enabled: true')
  })

  it.each([
    ['an invalid file', '---\nid: Broken Id\n---\nOur notes.\n'],
    ['another rule', '---\nid: our-branches\ntitle: Ours\napplies: branch\nwhy: Ours\n---\n'],
  ])(
    'should fail with DCK-RUL-001 and keep the file when the default name holds %s',
    async (_case, text) => {
      const { files, workspace } = arrange()
      const path = `${FOLDERS.repository}/branch-format.md`
      files.texts.set(path, text)

      const result = await workspace.setEnabled('branch-format', true, 'repository')

      expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-001' } } })
      expect(result.ok ? '' : result.error.message).toContain(path)
      expect(files.texts.get(path)).toBe(text)
    },
  )

  it('should name the file a change is written to when asked before the change', async () => {
    const { workspace, put } = arrange()
    put('repository', { id: 'branch-format', title: 'Our branches' }, 'branches')
    const { rules } = await workspace.load()

    const files = rules.map((rule) => workspace.fileFor(rule, 'repository'))
    const global = rules.map((rule) => workspace.fileFor(rule, 'global'))

    expect(files.slice(0, 2)).toEqual([
      `${FOLDERS.repository}/branches.md`,
      `${FOLDERS.repository}/commit-message.md`,
    ])
    expect(global[0]).toBe(`${FOLDERS.global}/branch-format.md`)
  })

  it.each([
    ['the field does not exist', 'branch-format', 0, 'ticket', 'feat'],
    ['the value breaks the check', 'branch-format', 0, 'types', 'feat|(fix'],
  ] as const)(
    'should fail with DCK-RUL-001 and write nothing when %s',
    async (_case, id, check, name, value) => {
      const { files, workspace } = arrange()

      const result = await workspace.setField(id, check, name, value, 'repository')

      expect(result.ok ? undefined : result.error.data?.code).toBe('DCK-RUL-001')
      expect(files.texts.size).toBe(0)
    },
  )

  it('should fail with DCK-RUL-005 when enabling a rule that does not exist', async () => {
    const { workspace } = arrange()

    const result = await workspace.setEnabled('no-such-rule', true, 'repository')

    expect(result.ok ? undefined : result.error.data?.code).toBe('DCK-RUL-005')
  })
})

describe('createRulesWorkspace, agents', () => {
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
## Rules to follow in this repository

- Branch names: Use <type>/<short-slug> in lowercase with a type from feat, fix, docs, refactor, test, chore, ci, for example feat/add-login; long-lived branches such as main, master, develop keep their names
- Commit messages: Start with <type>(<optional scope>): <summary> with a type from feat, fix, docs, refactor, test, chore, ci, for example fix(cli): handle empty input; Keep the first line within 72 characters
<!-- dck:end -->
`,
    )
    expect((await workspace.load()).agents).toMatchObject({ shared: true, stale: false })
  })

  it('should leave a rule out of the block when only the user folder switched it on', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.setEnabled('commit-message', true, 'global')

    await workspace.shareWithAgents(true)

    const text = files.texts.get(AGENTS) ?? ''
    expect(text).toContain('- Branch names:')
    expect(text).not.toContain('- Commit messages:')
  })

  it('should write nothing and fail with DCK-RUL-004 when only the user folder switched a rule on', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('commit-message', true, 'global')

    const result = await workspace.shareWithAgents(true)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-004' } } })
    expect(files.texts.has(AGENTS)).toBe(false)
  })

  it('should remove the block when the last repository rule is switched off and it is refreshed', async () => {
    const { files, workspace } = arrange()
    files.texts.set(AGENTS, ORIGINAL)
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)
    await workspace.setEnabled('branch-format', false, 'repository')

    const result = await workspace.shareWithAgents(true)

    expect(result.ok).toBe(true)
    expect(files.texts.get(AGENTS)).toBe(ORIGINAL)
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
      errorBody('DCK-RUL-002', `${AGENTS}: not a regular file of at most 256 KB`),
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

  it('should report a stale block when a rule changes after sharing, until it is shared again', async () => {
    const { workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)

    await workspace.setEnabled('commit-message', true, 'repository')
    const changed = (await workspace.load()).agents
    await workspace.shareWithAgents(true)

    expect(changed).toMatchObject({ shared: true, stale: true })
    expect((await workspace.load()).agents).toMatchObject({ shared: true, stale: false })
  })

  it('should bring the shared block up to date and say so when a rule changes after sharing', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)
    await workspace.setEnabled('commit-message', true, 'repository')

    const refreshed = await workspace.refreshShared()

    expect(refreshed).toEqual(ok(true))
    expect(files.texts.get(AGENTS)).toContain('- Commit messages: ')
    expect((await workspace.load()).agents).toMatchObject({ shared: true, stale: false })
  })

  it('should write nothing when the block is not shared and a rule changes', async () => {
    const { files, workspace } = arrange()
    await workspace.setEnabled('branch-format', true, 'repository')

    const refreshed = await workspace.refreshShared()

    expect(refreshed).toEqual(ok(false))
    expect(files.texts.has(AGENTS)).toBe(false)
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
