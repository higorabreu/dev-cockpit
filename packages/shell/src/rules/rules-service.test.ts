import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BUILT_IN_EXTENSION_ID,
  type GitStatus,
  type LogContext,
  type Matcher,
  silentLogger,
} from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRulesService, type RulesServiceOptions } from './rules-service.ts'

let directory = ''
let root = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-rules-service-'))
  root = join(directory, 'acme', 'backend')
  await mkdir(join(root, '.git'), { recursive: true })
  await mkdir(join(root, 'src', 'api'), { recursive: true })
})

afterEach(() => rm(directory, { recursive: true, force: true }))

const plainMatch: Matcher = (expression, text) => (expression.test(text) ? 'match' : 'no-match')

const make = (overrides: Partial<RulesServiceOptions> = {}) =>
  createRulesService({
    configDir: join(directory, 'config'),
    appVersion: '0.2.0',
    disabled: () => [],
    match: plainMatch,
    logger: silentLogger,
    ...overrides,
  })

const read = (...parts: string[]) => readFile(join(root, ...parts), 'utf8')

const git = (
  branch: string | undefined,
  ...subjects: string[]
): Pick<GitStatus, 'root' | 'branch' | 'outgoing'> => ({
  root,
  branch,
  outgoing: subjects.map((subject, index) => ({ hash: `a1b2c3${index}`, subject, time: 0 })),
})

describe('createRulesService view', () => {
  it('should be undefined when the directory is not inside a git repository', async () => {
    const view = await make().view(directory)

    expect(view).toBeUndefined()
  })

  it('should list the built-in examples switched off when the repository has no rule', async () => {
    const view = await make().view(root)

    expect(view?.root).toBe(root)
    expect(view?.rules.map(({ id, enabled, source }) => ({ id, enabled, source }))).toEqual([
      { id: 'branch-format', enabled: false, source: 'built-in' },
      { id: 'commit-message', enabled: false, source: 'built-in' },
      { id: 'mr-description', enabled: false, source: 'built-in' },
      { id: 'review-rubric', enabled: false, source: 'built-in' },
    ])
    expect(view?.invalid).toEqual([])
    expect(view?.agents).toEqual({
      file: join(root, 'AGENTS.md'),
      shared: false,
      stale: false,
      claudeImportMissing: false,
    })
  })

  it('should describe a rule with its texts and its fields when it has checks', async () => {
    const view = await make().view(root)

    const commit = view?.rules.find((rule) => rule.id === 'commit-message')

    expect(commit).toMatchObject({
      title: 'Commit messages',
      applies: 'commit',
      why: 'The history reads as a changelog and release notes can be generated from it',
    })
    expect(commit?.fields).toEqual([
      {
        check: 0,
        name: 'types',
        kind: 'text',
        value: 'feat|fix|docs|refactor|test|chore|ci',
        message: expect.stringContaining('feat, fix, docs'),
      },
      {
        check: 1,
        name: 'maxLength',
        kind: 'number',
        value: 72,
        message: 'Keep the first line within 72 characters',
      },
    ])
  })

  it('should find the root of the repository when the directory is a folder inside it', async () => {
    const view = await make().view(join(root, 'src', 'api'))

    expect(view?.root).toBe(root)
  })

  it('should list a broken file with its path and what is wrong when a rule is invalid', async () => {
    const path = join(root, '.dck', 'rules', 'broken.md')
    await mkdir(join(root, '.dck', 'rules'), { recursive: true })
    await writeFile(path, '---\nid: Broken Id\n---\nA note.\n')

    const view = await make().view(root)

    expect(view?.invalid).toEqual([{ path, message: 'id: must be lowercase kebab case' }])
    expect(view?.rules).toHaveLength(4)
  })

  it('should list no rule when the built-in extension is disabled in the settings', async () => {
    const view = await make({ disabled: () => [BUILT_IN_EXTENSION_ID] }).view(root)

    expect(view?.rules).toEqual([])
  })
})

describe('createRulesService changes', () => {
  it('should write the complete rule in the repository and return it on when it is switched on', async () => {
    const service = make()

    const result = await service.setEnabled(join(root, 'src'), root, 'branch-format', true)

    const file = await read('.dck', 'rules', 'branch-format.md')
    expect(file).toContain('enabled: true')
    expect(file).toContain("title: 'Branch names'")
    expect(result.ok && result.value.rules[0]).toMatchObject({
      id: 'branch-format',
      enabled: true,
      source: 'repository',
    })
  })

  it('should save the new value and return it when a field is edited', async () => {
    const service = make()
    await service.setEnabled(root, root, 'commit-message', true)

    const result = await service.setField(root, root, 'commit-message', 1, 'maxLength', 50)

    const fields = result.ok ? result.value.rules[1]?.fields : []
    expect(fields?.[1]).toMatchObject({
      name: 'maxLength',
      value: 50,
      message: 'Keep the first line within 50 characters',
    })
    expect(await read('.dck', 'rules', 'commit-message.md')).toContain('maxLength: 50')
  })

  it('should refuse the value and keep the file when the field would break the check', async () => {
    const service = make()
    await service.setEnabled(root, root, 'branch-format', true)
    const before = await read('.dck', 'rules', 'branch-format.md')

    const result = await service.setField(root, root, 'branch-format', 0, 'types', 'feat|fix(')

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-001' } } })
    expect(await read('.dck', 'rules', 'branch-format.md')).toBe(before)
  })

  it('should write the marked block and report it shared when the rules are shared with agents', async () => {
    const service = make()
    await writeFile(join(root, 'AGENTS.md'), '# Backend\n\nRun the tests first.\n')
    await service.setEnabled(root, root, 'branch-format', true)

    const result = await service.shareWithAgents(root, root, true)

    const text = await read('AGENTS.md')
    expect(text).toContain('# Backend\n\nRun the tests first.\n')
    expect(text).toContain('<!-- dck:start -->')
    expect(text).toContain('- Branch names: Use <type>/<short-slug>')
    expect(result.ok && result.value.agents).toMatchObject({ shared: true, stale: false })
  })

  it('should bring the shared block up to date when a rule is switched on from the page', async () => {
    const service = make()
    await service.setEnabled(root, root, 'branch-format', true)
    await service.shareWithAgents(root, root, true)

    const result = await service.setEnabled(root, root, 'commit-message', true)

    expect(result.ok && result.value.agents).toMatchObject({ shared: true, stale: false })
    expect(await read('AGENTS.md')).toContain('- Commit messages: ')
  })

  it('should bring the shared block up to date when a field is edited from the page', async () => {
    const service = make()
    await service.setEnabled(root, root, 'commit-message', true)
    await service.shareWithAgents(root, root, true)

    const result = await service.setField(root, root, 'commit-message', 1, 'maxLength', 50)

    expect(result.ok && result.value.agents.stale).toBe(false)
    expect(await read('AGENTS.md')).toContain('Keep the first line within 50 characters')
  })

  it('should still report the block out of date when a rule file is edited by hand', async () => {
    const service = make()
    await service.setEnabled(root, root, 'branch-format', true)
    await service.shareWithAgents(root, root, true)
    const file = join(root, '.dck', 'rules', 'branch-format.md')
    await writeFile(file, (await readFile(file, 'utf8')).replace('Branch names', 'Branches'))

    const view = await service.view(root)

    expect(view?.agents).toMatchObject({ shared: true, stale: true })
  })

  it('should refuse without writing when the tab is now in another repository than the one shown', async () => {
    const other = join(directory, 'acme', 'frontend')
    await mkdir(join(other, '.git'), { recursive: true })

    const result = await make().setEnabled(other, root, 'branch-format', true)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-006' } } })
    expect(
      await readFile(join(other, '.dck', 'rules', 'branch-format.md')).catch(() => 'none'),
    ).toBe('none')
    expect(
      await readFile(join(root, '.dck', 'rules', 'branch-format.md')).catch(() => 'none'),
    ).toBe('none')
  })

  it('should leave the file as it was when the sharing is switched off', async () => {
    const service = make()
    await writeFile(join(root, 'AGENTS.md'), '# Backend\n')
    await service.setEnabled(root, root, 'branch-format', true)
    await service.shareWithAgents(root, root, true)

    const result = await service.shareWithAgents(root, root, false)

    expect(await read('AGENTS.md')).toBe('# Backend\n')
    expect(result.ok && result.value.agents.shared).toBe(false)
  })

  it('should add the import line and stop reporting it missing when CLAUDE.md does not import AGENTS.md', async () => {
    const service = make()
    await writeFile(join(root, 'CLAUDE.md'), '# Notes\n')
    const before = await service.view(root)

    const result = await service.addClaudeImport(root, root)

    expect(before?.agents.claudeImportMissing).toBe(true)
    expect(await read('CLAUDE.md')).toBe('# Notes\n@AGENTS.md\n')
    expect(result.ok && result.value.agents.claudeImportMissing).toBe(false)
  })

  it('should fail without writing when the directory is not inside a git repository', async () => {
    const result = await make().setEnabled(directory, root, 'branch-format', true)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-003' } } })
  })

  it('should return a failure and log it when the file cannot be written', async () => {
    await writeFile(join(root, '.dck'), 'not a folder\n')
    const warnings: (LogContext | undefined)[] = []
    const service = make({
      logger: { ...silentLogger, warn: (_message, context) => void warnings.push(context) },
    })

    const result = await service.setEnabled(root, root, 'branch-format', true)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-002' } } })
    expect(result.ok ? '' : result.error.message).toContain('ENOTDIR')
    expect(warnings).toMatchObject([
      { path: join(root, '.dck', 'rules', 'branch-format.md') },
      { root, action: 'set-enabled', error: expect.stringContaining('ENOTDIR') },
    ])
  })

  it('should refuse to share when AGENTS.md is a link', async () => {
    await writeFile(join(directory, 'notes.md'), '# Notes\n')
    await symlink(join(directory, 'notes.md'), join(root, 'AGENTS.md'))

    const result = await make().shareWithAgents(root, root, true)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-002' } } })
    expect(await readFile(join(directory, 'notes.md'), 'utf8')).toBe('# Notes\n')
  })
})

describe('createRulesService marks', () => {
  it('should mark nothing when no rule is enabled', async () => {
    const marks = await make().marks(git('Feature/Login', 'updated things'))

    expect(marks).toBeUndefined()
  })

  it('should mark nothing when the branch and the commits follow the enabled rules', async () => {
    const service = make()
    await service.setEnabled(root, root, 'branch-format', true)
    await service.setEnabled(root, root, 'commit-message', true)

    const marks = await service.marks(git('feat/add-login', 'feat: add the login form'))

    expect(marks).toBeUndefined()
  })

  it('should mark the branch and each failing commit with the check messages when they are outside a rule', async () => {
    const service = make()
    await service.setEnabled(root, root, 'branch-format', true)
    await service.setEnabled(root, root, 'commit-message', true)

    const marks = await service.marks(
      git('Feature/Login', 'updated things', 'fix: handle empty input'),
    )

    expect(marks?.branch).toEqual({
      failed: [expect.stringContaining('Use <type>/<short-slug>')],
      slow: [],
    })
    expect(marks?.commits).toEqual({
      a1b2c30: {
        failed: [expect.stringContaining('Start with <type>(<optional scope>): <summary>')],
        slow: [],
      },
    })
  })

  it('should skip the branch when the head is detached', async () => {
    const service = make()
    await service.setEnabled(root, root, 'branch-format', true)

    const marks = await service.marks(git(undefined))

    expect(marks).toBeUndefined()
  })

  it('should judge a commit by the first line checks only when a check looks at the whole message', async () => {
    await mkdir(join(root, '.dck', 'rules'), { recursive: true })
    await writeFile(
      join(root, '.dck', 'rules', 'ticket.md'),
      [
        '---',
        'id: ticket',
        'title: Ticket',
        'applies: commit',
        'why: Work is traceable',
        'check:',
        "  - required: 'Refs: ABC-[0-9]+'",
        '    message: Name the ticket in the body',
        '  - maxLength: 10',
        '    scope: first-line',
        '    message: Keep the subject short',
        '---',
        '',
      ].join('\n'),
    )

    const marks = await make().marks(git('main', 'fix: handle empty input'))

    expect(marks?.commits).toEqual({ a1b2c30: { failed: ['Keep the subject short'], slow: [] } })
  })

  it('should keep what it read for a few seconds when the files change behind it', async () => {
    let time = 1000
    const service = make({ ttlMs: 5000, now: () => time })
    await service.setEnabled(root, root, 'branch-format', true)
    await service.marks(git('Feature/Login'))
    await rm(join(root, '.dck'), { recursive: true })

    time += 4000
    const cached = await service.marks(git('Feature/Login'))
    time += 2000
    const fresh = await service.marks(git('Feature/Login'))

    expect(cached?.branch?.failed).toHaveLength(1)
    expect(fresh).toBeUndefined()
  })

  it('should drop what it read when a change is written', async () => {
    const service = make({ ttlMs: 60_000 })
    await service.setEnabled(root, root, 'branch-format', true)
    const before = await service.marks(git('Feature/Login'))

    await service.setEnabled(root, root, 'branch-format', false)
    const after = await service.marks(git('Feature/Login'))

    expect(before?.branch?.failed).toHaveLength(1)
    expect(after).toBeUndefined()
  })

  it('should run every check through the given matcher and not repeat a text already checked', async () => {
    const texts: string[] = []
    const service = make({
      match: (_expression, text) => {
        texts.push(text)
        return 'timeout'
      },
    })
    await service.setEnabled(root, root, 'branch-format', true)

    const first = await service.marks(git('feat/add-login'))
    await service.marks(git('feat/add-login'))

    expect(first?.branch).toEqual({ failed: [], slow: [expect.stringContaining('Use <type>/')] })
    expect(texts).toEqual(['feat/add-login'])
  })

  it('should not run a check again and say it was not checked when it ran out of time once', async () => {
    const texts: string[] = []
    const service = make({
      match: (expression, text) => {
        texts.push(text)
        return text === 'slow' ? 'timeout' : plainMatch(expression, text)
      },
    })
    await service.setEnabled(root, root, 'branch-format', true)

    const first = await service.marks(git('slow'))
    const next = await service.marks(git('Feature/Login'))

    expect(texts).toEqual(['slow'])
    expect(first?.branch).toEqual({ failed: [], slow: [expect.stringContaining('Use <type>/')] })
    expect(next?.branch).toEqual({ failed: [], slow: [expect.stringContaining('Use <type>/')] })
  })
})
