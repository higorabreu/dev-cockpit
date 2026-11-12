import {
  createRulesWorkspace,
  createTranslator,
  EXTENSION_API_VERSION,
  type ExtensionCandidate,
  errorBody,
  fail,
  type ImplicitSource,
  implicitManifest,
  type Locale,
  type MatchResult,
} from '@dck/core'
import { MemoryRuleFiles } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { EXIT, runCli } from './cli.ts'

const ROOT = '/home/ana/acme/backend'
const GLOBAL = '/home/ana/.config/dev-cockpit'
const REPOSITORY_RULES = `${ROOT}/.dck/rules`
const GLOBAL_RULES = `${GLOBAL}/rules`
const AGENTS = `${ROOT}/AGENTS.md`
const APP_VERSION = '0.3.0'

interface Options {
  readonly locale?: Locale
  readonly branch?: string
  readonly stdin?: string
  readonly match?: MatchResult
  readonly inRepository?: boolean
}

function setup(options: Options = {}) {
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
  const workspace = createRulesWorkspace({
    // Like the files adapter: an implicit extension exists only while its rules folder does
    finder: {
      find: async () => [
        ...(has(GLOBAL_RULES) ? [implicit('global', GLOBAL)] : []),
        ...(has(REPOSITORY_RULES) ? [implicit('repository', `${ROOT}/.dck`)] : []),
      ],
    },
    files,
    disabled: async () => new Set(),
    appVersion: APP_VERSION,
    repositoryRoot: ROOT,
    globalDir: GLOBAL,
    join: (...parts) => parts.join('/'),
  })
  const out: string[] = []
  const err: string[] = []
  const run = (...argv: string[]) =>
    runCli(argv, {
      endpoint: '',
      t: createTranslator(options.locale ?? 'en').t,
      connect: () => Promise.reject(new Error('invariant: the rules must not reach the daemon')),
      out: (text) => void out.push(text),
      err: (text) => void err.push(text),
      rules: {
        workspace,
        inRepository: options.inRepository ?? true,
        currentBranch: async () => options.branch,
        readInput: async (file) =>
          file === undefined || file === '-' ? options.stdin : files.texts.get(file),
        match: (expression, text) =>
          options.match ?? (expression.test(text) ? 'match' : 'no-match'),
        confirm: () => Promise.reject(new Error('invariant: these commands ask nothing')),
        relative: (path) => (path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path),
      },
    })
  return { files, workspace, run, out: () => out.join(''), err: () => err.join('') }
}

const lines = (text: string) => text.trimEnd().split('\n')

describe('dck rules', () => {
  it('should list every built-in example as off when there is no rule anywhere (C1)', async () => {
    const { run, out, err } = setup()

    const code = await run('rules')

    expect(code).toBe(EXIT.ok)
    expect(err()).toBe('')
    expect(lines(out())).toEqual([
      'branch-format   branch  off  built-in',
      'commit-message  commit  off  built-in',
      'mr-description  pr      off  built-in',
      'review-rubric   review  off  built-in',
    ])
  })

  it('should show the source that won and the ones it overrides when higher folders repeat a rule (C5)', async () => {
    const { run, out, workspace } = setup()
    await workspace.setEnabled('branch-format', true, 'global')
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.setEnabled('commit-message', true, 'global')

    await run('rules', 'list')

    expect(lines(out()).slice(0, 2)).toEqual([
      'branch-format   branch  on   repository  overrides global, built-in',
      'commit-message  commit  on   global      overrides built-in',
    ])
  })

  it('should list an invalid file with its path, the translated message and the detail when a file is broken (C6)', async () => {
    const { run, out, files } = setup()
    files.texts.set(`${REPOSITORY_RULES}/broken.md`, '---\nid: Broken\n---\n')
    files.texts.set(`${REPOSITORY_RULES}/no-title.md`, '---\nid: no-title\n---\n')

    const code = await run('rules')

    expect(code).toBe(EXIT.ok)
    expect(lines(out()).slice(4)).toEqual([
      '',
      'Invalid:',
      '  .dck/rules/broken.md    Invalid rule: id: must be lowercase kebab case',
      '  .dck/rules/no-title.md  Invalid rule: title: required; applies: required; why: required',
    ])
  })

  it('should say the agents file is out of date when its block no longer matches the rules', async () => {
    const { run, out, workspace } = setup()
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)
    await run('rules')
    const current = out()
    await workspace.setEnabled('commit-message', true, 'repository')

    await run('rules')

    expect(current).not.toContain('AGENTS.md')
    expect(lines(out()).slice(-2)).toEqual([
      '',
      'AGENTS.md is out of date with the rules. Refresh it with: dck init',
    ])
  })

  it('should print the listing in portuguese when the translator is portuguese', async () => {
    const { run, out, files, workspace } = setup({ locale: 'pt-BR' })
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)
    files.texts.set(`${REPOSITORY_RULES}/broken.md`, '---\nid: Broken\n---\n')
    await workspace.setEnabled('commit-message', true, 'repository')

    await run('rules')

    expect(lines(out())).toEqual([
      'branch-format   branch  ligada     repositório  sobrepõe embutida',
      'commit-message  commit  ligada     repositório  sobrepõe embutida',
      'mr-description  pr      desligada  embutida',
      'review-rubric   review  desligada  embutida',
      '',
      'Inválidos:',
      '  .dck/rules/broken.md  Regra inválida: id: must be lowercase kebab case',
      '',
      'AGENTS.md está desatualizado em relação às regras. Atualize com: dck init',
    ])
  })

  it.each([
    [['rules', 'remove'], EXIT.usage],
    [['rules', 'list', 'extra'], EXIT.usage],
    [['rules', 'enable'], EXIT.usage],
    [['rules', 'enable', 'branch-format', 'extra'], EXIT.usage],
    [['rules', 'disable', '--everywhere'], EXIT.usage],
    [['rules', '--help'], EXIT.ok],
  ])('should print the usage and write nothing when the arguments are %j', async (argv, exit) => {
    const { run, out, err, files } = setup()

    const code = await run(...argv)

    expect(code).toBe(exit)
    expect(err()).toContain('Usage: dck rules [list]')
    expect(out()).toBe('')
    expect(files.texts.size).toBe(0)
  })
})

describe('dck rules enable and disable', () => {
  it('should write the rule in the repository and say where when enabling', async () => {
    const { run, out, files } = setup()

    const code = await run('rules', 'enable', 'branch-format')

    expect(code).toBe(EXIT.ok)
    expect(out()).toBe('branch-format switched on in .dck/rules/branch-format.md\n')
    expect([...files.texts.keys()]).toEqual([`${REPOSITORY_RULES}/branch-format.md`])
    expect(files.texts.get(`${REPOSITORY_RULES}/branch-format.md`)).toContain('enabled: true')
  })

  it('should write in the folder of the user when --global is given', async () => {
    const { run, out, files } = setup({ locale: 'pt-BR' })

    const code = await run('rules', 'enable', '--global', 'commit-message')

    expect(code).toBe(EXIT.ok)
    expect(out()).toBe(`commit-message ligada em ${GLOBAL_RULES}/commit-message.md\n`)
    expect([...files.texts.keys()]).toEqual([`${GLOBAL_RULES}/commit-message.md`])
  })

  it('should say the repository keeps it off when --global switches on a rule the repository switched off', async () => {
    const { run, out } = setup()
    await run('rules', 'disable', 'commit-message')

    const code = await run('rules', 'enable', '--global', 'commit-message')

    expect(code).toBe(EXIT.ok)
    expect(lines(out()).slice(-2)).toEqual([
      `commit-message switched on in ${GLOBAL_RULES}/commit-message.md`,
      'The repository keeps commit-message off and has the last word',
    ])
  })

  it('should refuse to switch a rule in the repository and keep working with --global when outside a repository', async () => {
    const { run, err, files } = setup({ inRepository: false })

    const refused = await run('rules', 'enable', 'commit-message')
    const global = await run('rules', 'enable', '--global', 'commit-message')

    expect([refused, global]).toEqual([EXIT.usage, EXIT.ok])
    expect(err()).toBe('Not inside a git repository\n')
    expect([...files.texts.keys()]).toEqual([`${GLOBAL_RULES}/commit-message.md`])
  })

  it('should rewrite the file with the rule off when disabling', async () => {
    const { run, out, files } = setup()
    await run('rules', 'enable', 'branch-format')

    const code = await run('rules', 'disable', 'branch-format')

    expect(code).toBe(EXIT.ok)
    expect(lines(out())[1]).toBe('branch-format switched off in .dck/rules/branch-format.md')
    expect(files.texts.get(`${REPOSITORY_RULES}/branch-format.md`)).toContain('enabled: false')
  })

  it.each([
    ['en', 'No rule has this id: no-such-rule\n'],
    ['pt-BR', 'Nenhuma regra tem este id: no-such-rule\n'],
  ] as const)(
    'should print the translated error and fail when the id is unknown (%s)',
    async (locale, message) => {
      const { run, out, err, files } = setup({ locale })

      const code = await run('rules', 'enable', 'no-such-rule')

      expect(code).toBe(EXIT.failed)
      expect(err()).toBe(message)
      expect(out()).toBe('')
      expect(files.texts.size).toBe(0)
    },
  )

  it('should refresh the block of the agents file and say so when the block exists', async () => {
    const { run, out, files, workspace } = setup()
    files.texts.set(AGENTS, '# Agents\n')
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)

    await run('rules', 'enable', 'commit-message')

    expect(lines(out())).toEqual([
      'commit-message switched on in .dck/rules/commit-message.md',
      'AGENTS.md updated with the current rules',
    ])
    expect(files.texts.get(AGENTS)).toContain('- Commit messages: ')
    expect((await workspace.load()).agents.stale).toBe(false)
  })

  it('should leave the agents file alone when it has no block', async () => {
    const { run, out, files } = setup()
    files.texts.set(AGENTS, '# Agents\n')

    await run('rules', 'enable', 'commit-message')

    expect(out()).not.toContain('AGENTS.md')
    expect(files.texts.get(AGENTS)).toBe('# Agents\n')
  })

  it.each([
    ['en', 'Could not write the file: EACCES: permission denied\n'],
    ['pt-BR', 'Não foi possível gravar o arquivo: EACCES: permission denied\n'],
  ] as const)(
    'should print a translated error and exit as an internal error when the write fails (%s)',
    async (locale, message) => {
      const { run, out, err, files } = setup({ locale })
      files.writeText = async () => fail(errorBody('DCK-RUL-002', 'EACCES: permission denied'))

      const code = await run('rules', 'enable', 'branch-format')

      expect(code).toBe(EXIT.software)
      expect(err()).toBe(message)
      expect(out()).toBe('')
    },
  )
})

describe('dck guide', () => {
  it.each([
    ['en', 'No rule is on for commit. Nothing to show.\n'],
    ['pt-BR', 'Nenhuma regra ligada para commit. Nada a mostrar.\n'],
  ] as const)(
    'should say there is nothing to show and succeed when no rule is on (C1, %s)',
    async (locale, message) => {
      const { run, out, err } = setup({ locale })

      const code = await run('guide', 'commit')

      expect(code).toBe(EXIT.ok)
      expect(out()).toBe('')
      expect(err()).toBe(message)
    },
  )

  it('should print the instruction on the standard output and its size on the error stream when a rule is on (C4)', async () => {
    const { run, out, err } = setup()
    await run('rules', 'enable', 'commit-message')

    const code = await run('guide', 'commit')

    const text = out().split('\n').slice(1).join('\n')
    expect(code).toBe(EXIT.ok)
    expect(text).toMatch(/^## Commit messages\n\nWrite the first line as /)
    expect(text).toContain('- Keep the first line within 72 characters\n')
    expect(err()).toBe(
      `rules: 1, lines: ${lines(text).length}, estimated tokens: ${Math.ceil((text.length - 1) / 4)}\n`,
    )
  })

  it('should replace the control and bidi characters of a rule when guide and check print it', async () => {
    const { run, out, err, files } = setup({ stdin: 'anything' })
    files.texts.set(
      `${REPOSITORY_RULES}/forged.md`,
      '---\nid: forged\ntitle: "Forged\\e[2J"\napplies: commit\nwhy: Test\ncheck:\n  - required: \'never\'\n    message: "Fix \\u009b31m\\u202eit"\n---\nLine one\u001b[2J\n\tLine two\u202e\n',
    )

    await run('guide', 'commit')
    const code = await run('check', 'commit')

    expect(code).toBe(EXIT.failed)
    expect(out()).toBe(
      '## Forged?[2J\n\nLine one?[2J\n\tLine two?\n\nWhy: Test\n\nChecked automatically:\n- Fix ?31m?it\n',
    )
    expect(lines(err()).at(-1)).toBe('Forged?[2J: Fix ?31m?it')
  })

  it.each([
    ['en', 'Above the budget of 20 tokens.'],
    ['pt-BR', 'Acima do orçamento de 20 tokens.'],
  ] as const)(
    'should warn on the error stream when the tokens pass the budget (C4, %s)',
    async (locale, warning) => {
      const { run, err } = setup({ locale })
      await run('rules', 'enable', 'commit-message')

      const code = await run('guide', '--budget', '20', 'commit')

      expect(code).toBe(EXIT.ok)
      expect(lines(err())[1]).toBe(warning)
    },
  )

  it.each([
    [['guide'], EXIT.usage],
    [['guide', 'commit', 'extra'], EXIT.usage],
    [['guide', 'commit', '--budget'], EXIT.usage],
    [['guide', 'commit', '--budget', 'many'], EXIT.usage],
    [['guide', '--verbose'], EXIT.usage],
    [['guide', '--help'], EXIT.ok],
  ])('should print the usage when the arguments are %j', async (argv, exit) => {
    const { run, out, err } = setup()

    const code = await run(...argv)

    expect(code).toBe(exit)
    expect(err()).toBe('Usage: dck guide <application> [--budget N]\n')
    expect(out()).toBe('')
  })
})

describe('dck check', () => {
  it('should print nothing and succeed when the current branch matches (C3)', async () => {
    const { run, out, err } = setup({ branch: 'feat/add-login' })
    await run('rules', 'enable', 'branch-format')
    const before = out()

    const code = await run('check', 'branch')

    expect(code).toBe(EXIT.ok)
    expect(out()).toBe(before)
    expect(err()).toBe('')
  })

  it('should print the rule and the message of the failing check and fail when the current branch does not match (C3)', async () => {
    const { run, err } = setup({ branch: 'Feature/Add_Login' })
    await run('rules', 'enable', 'branch-format')

    const code = await run('check', 'branch')

    expect(code).toBe(EXIT.failed)
    expect(err()).toBe(
      'Branch names: Use <type>/<short-slug> in lowercase with a type from feat, fix, docs, refactor, test, chore, ci, for example feat/add-login; long-lived branches such as main, master, develop keep their names\n',
    )
  })

  it('should pass in silence when no rule is on (C1)', async () => {
    const { run, out, err } = setup({ branch: 'Feature/Add_Login', stdin: 'whatever' })

    const codes = [await run('check', 'branch'), await run('check', 'commit')]

    expect(codes).toEqual([EXIT.ok, EXIT.ok])
    expect(out() + err()).toBe('')
  })

  it('should have nothing to check when there is no current branch', async () => {
    const { run, err } = setup({ branch: undefined })
    await run('rules', 'enable', 'branch-format')

    const code = await run('check', 'branch')

    expect(code).toBe(EXIT.ok)
    expect(err()).toBe('')
  })

  it('should ignore one trailing newline when the branch name comes from the standard input', async () => {
    const { run, err } = setup({ branch: 'Feature/Add_Login', stdin: 'feat/add-login\n' })
    await run('rules', 'enable', 'branch-format')

    const code = await run('check', 'branch', '-')

    expect(code).toBe(EXIT.ok)
    expect(err()).toBe('')
  })

  it('should check the text of a file or of the standard input when the application is not a branch', async () => {
    const { run, err, files } = setup({ stdin: 'fixed the bug\n\nDetails.\n' })
    files.texts.set('/home/ana/message.txt', 'fix(cli): handle empty input\n\nDetails.\n')
    await run('rules', 'enable', 'commit-message')

    const fromFile = await run('check', 'commit', '/home/ana/message.txt')
    const fromInput = await run('check', 'commit')
    const fromDash = await run('check', 'commit', '-')

    expect([fromFile, fromInput, fromDash]).toEqual([EXIT.ok, EXIT.failed, EXIT.failed])
    expect(lines(err())).toHaveLength(2)
    expect(err()).toContain('Commit messages: Start with <type>(<optional scope>): <summary>')
  })

  it('should apply a field the user changed in their own file when checking and guiding (C2)', async () => {
    const { run, out, err, files } = setup({ stdin: 'hotfix: stop the leak\n' })
    await run('rules', 'enable', 'commit-message')
    const file = `${REPOSITORY_RULES}/commit-message.md`
    const before = await run('check', 'commit')

    files.texts.set(file, (files.texts.get(file) ?? '').replace("'feat|fix|", "'hotfix|feat|fix|"))
    const after = await run('check', 'commit')
    await run('guide', 'commit')

    expect([before, after]).toEqual([EXIT.failed, EXIT.ok])
    expect(err()).toContain('with a type from feat, fix, docs')
    expect(out()).toContain('with a type from hotfix, feat, fix, docs')
  })

  it.each([
    ['en', 'Could not read /home/ana/missing.txt\n'],
    ['pt-BR', 'Não foi possível ler /home/ana/missing.txt\n'],
  ] as const)(
    'should print a translated error as a usage failure when the file cannot be read (%s)',
    async (locale, message) => {
      const { run, err } = setup({ locale })

      const code = await run('check', 'commit', '/home/ana/missing.txt')

      expect(code).toBe(EXIT.usage)
      expect(err()).toBe(message)
    },
  )

  it.each([
    ['en', 'Branch names: Use <type>/<short-slug>', '(not checked, the expression took too long)'],
    [
      'pt-BR',
      'Branch names: Use <type>/<short-slug>',
      '(não conferido, a expressão demorou demais)',
    ],
  ] as const)(
    'should fail with a note when the injected matcher runs out of time (%s)',
    async (locale, start, note) => {
      const { run, err } = setup({ locale, branch: 'feat/add-login', match: 'timeout' })
      await run('rules', 'enable', 'branch-format')

      const code = await run('check', 'branch')

      expect(code).toBe(EXIT.failed)
      expect(err().startsWith(start)).toBe(true)
      expect(err().endsWith(` ${note}\n`)).toBe(true)
    },
  )

  it('should print nothing when the branch passes and the block of AGENTS.md is out of date (C3)', async () => {
    const { run, err, out, workspace } = setup({ branch: 'feat/add-login' })
    await run('rules', 'enable', 'branch-format')
    await workspace.shareWithAgents(true)
    await workspace.setEnabled('commit-message', true, 'repository')
    const printed = out().length

    const code = await run('check', 'branch')

    expect(code).toBe(EXIT.ok)
    expect(err()).toBe('')
    expect(out().length).toBe(printed)
  })

  it.each([
    [['check'], EXIT.usage],
    [['check', 'commit', 'one.txt', 'two.txt'], EXIT.usage],
    [['check', '--help'], EXIT.ok],
    [['check', 'commit', '--help'], EXIT.ok],
  ])('should print the usage when the arguments are %j', async (argv, exit) => {
    const { run, out, err } = setup()

    const code = await run(...argv)

    expect(code).toBe(exit)
    expect(err()).toBe('Usage: dck check <application> [file|-]\n')
    expect(out()).toBe('')
  })
})

describe('runCli usage', () => {
  it('should list the commands of the rules when they are available', async () => {
    const { run, err } = setup()

    const code = await run('--help')

    expect(code).toBe(EXIT.ok)
    expect(err()).toContain('\n  rules      List the rules')
    expect(err()).toContain('\n  guide      Print the instructions')
    expect(err()).toContain('\n  check      Check the current branch')
  })

  it('should leave the commands of the rules out and treat them as unknown when they are not available', async () => {
    const err: string[] = []

    const code = await runCli(['rules'], {
      endpoint: '',
      t: createTranslator('en').t,
      connect: () => Promise.reject(new Error('invariant: the usage must not reach the daemon')),
      out: () => {},
      err: (text) => void err.push(text),
    })

    expect(code).toBe(EXIT.usage)
    expect(err.join('')).toContain('Usage: dck <command>')
    expect(err.join('')).not.toMatch(/rules|guide|check /)
  })
})
