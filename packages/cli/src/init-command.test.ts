import {
  createStandardsWorkspace,
  createTranslator,
  EXTENSION_API_VERSION,
  errorBody,
  fail,
  implicitManifest,
  type Locale,
} from '@dck/core'
import { MemoryStandardFiles } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { EXIT, runCli } from './cli.ts'

const ROOT = '/home/ana/acme/backend'
const GLOBAL = '/home/ana/.config/dev-cockpit'
const STANDARDS = `${ROOT}/.dck/standards`
const AGENTS = `${ROOT}/AGENTS.md`
const CLAUDE = `${ROOT}/CLAUDE.md`
const APP_VERSION = '0.3.0'
const HANDWRITTEN = '# Agents\n\nRun the tests before a commit.\n'

// An answer is what the user types: yes, no, or Enter for the default the question shows
type Answer = 'yes' | 'no' | 'enter'

function setup(answers: readonly Answer[] = [], locale: Locale = 'en', inRepository = true) {
  const files = new MemoryStandardFiles(parse)
  const workspace = createStandardsWorkspace({
    // Like the files adapter: a folder is an implicit extension only while it has files
    finder: {
      find: async () =>
        (
          [
            ['global', GLOBAL],
            ['repository', `${ROOT}/.dck`],
          ] as const
        )
          .filter(([, location]) =>
            [...files.texts.keys()].some((path) => path.startsWith(`${location}/standards/`)),
          )
          .map(([source, location]) => ({
            source,
            location,
            manifest: implicitManifest({
              source,
              apiVersion: EXTENSION_API_VERSION,
              appVersion: APP_VERSION,
              contributes: { standards: 'standards' },
            }),
          })),
    },
    files,
    disabled: async () => new Set(),
    appVersion: APP_VERSION,
    repositoryRoot: ROOT,
    globalDir: GLOBAL,
    join: (...parts) => parts.join('/'),
  })
  const pending = [...answers]
  const questions: string[] = []
  const out: string[] = []
  const err: string[] = []
  const run = (...argv: string[]) =>
    runCli(['init', ...argv], {
      endpoint: '',
      t: createTranslator(locale).t,
      connect: () => Promise.reject(new Error('invariant: init must not reach the daemon')),
      out: (text) => void out.push(text),
      err: (text) => void err.push(text),
      standards: {
        workspace,
        inRepository,
        currentBranch: async () => undefined,
        readInput: async () => undefined,
        match: () => 'no-match',
        async confirm(question, fallback) {
          questions.push(question)
          const answer = pending.shift()
          if (answer === undefined) throw new Error(`invariant: no answer for "${question}"`)
          return answer === 'enter' ? fallback : answer === 'yes'
        },
        relative: (path) => path.slice(ROOT.length + 1),
      },
    })
  const written = () =>
    [...files.texts.keys()]
      .filter((path) => path.startsWith(ROOT))
      .map((path) => path.slice(ROOT.length + 1))
      .sort()
  return {
    files,
    workspace,
    run,
    questions,
    written,
    out: () => out.join(''),
    err: () => err.join(''),
  }
}

const lines = (text: string) => text.trimEnd().split('\n')

describe('dck init', () => {
  it('should ask about each example and the sharing, show the files and write them when the user approves', async () => {
    const { run, questions, written, out, files } = setup([
      'enter',
      'enter',
      'yes',
      'enter',
      'enter',
      'yes',
    ])
    files.texts.set(AGENTS, HANDWRITTEN)

    const code = await run()

    expect(code).toBe(EXIT.ok)
    expect(questions).toEqual([
      'Branch names: The kind of work shows in the branch list and automation can rely on the name. Switch on? [Y/n] ',
      'Commit messages: The history reads as a changelog and release notes can be generated from it. Switch on? [Y/n] ',
      'Review rubric: A fixed order finds behavior problems before style remarks and makes reviews comparable. Switch on? [y/N] ',
      'Merge request description: A reviewer needs the intent and the evidence before reading the diff. Switch on? [y/N] ',
      'Share the rules with agents in AGENTS.md? [Y/n] ',
      'Apply? [y/N] ',
    ])
    expect(lines(out())).toEqual([
      'Files to write:',
      '  .dck/standards/branch-format.md',
      '  .dck/standards/commit-message.md',
      '  .dck/standards/review-rubric.md',
      '  AGENTS.md',
      'Done. See what is on with: dck standards',
    ])
    expect(written()).toEqual([
      '.dck/standards/branch-format.md',
      '.dck/standards/commit-message.md',
      '.dck/standards/review-rubric.md',
      'AGENTS.md',
    ])
    expect(files.texts.get(AGENTS)).toMatch(
      /^# Agents\n\nRun the tests before a commit\.\n\n<!-- dck:start -->\n/,
    )
    expect(files.texts.get(AGENTS)).toContain('- Review rubric: ')
  })

  it.each([
    ['en', 'Files to write:', 'Nothing was written.'],
    ['pt-BR', 'Arquivos a gravar:', 'Nada foi gravado.'],
  ] as const)(
    'should show what it would write and write nothing when the user does not approve (C4, %s)',
    async (locale, heading, closing) => {
      const { run, written, out } = setup(['yes', 'yes', 'no', 'no', 'yes', 'enter'], locale)

      const code = await run()

      expect(code).toBe(EXIT.ok)
      expect(lines(out())).toEqual([
        heading,
        '  .dck/standards/branch-format.md',
        '  .dck/standards/commit-message.md',
        '  AGENTS.md',
        closing,
      ])
      expect(written()).toEqual([])
    },
  )

  it('should ask in portuguese with the portuguese defaults when the translator is portuguese', async () => {
    const { run, questions, files } = setup(['yes', 'no', 'no', 'no', 'yes', 'no', 'no'], 'pt-BR')
    files.texts.set(CLAUDE, '# Claude\n')

    await run()

    expect(questions).toEqual([
      'Branch names: The kind of work shows in the branch list and automation can rely on the name. Ligar? [S/n] ',
      'Commit messages: The history reads as a changelog and release notes can be generated from it. Ligar? [S/n] ',
      'Review rubric: A fixed order finds behavior problems before style remarks and makes reviews comparable. Ligar? [s/N] ',
      'Merge request description: A reviewer needs the intent and the evidence before reading the diff. Ligar? [s/N] ',
      'Compartilhar as regras com os agentes em AGENTS.md? [S/n] ',
      'O Claude Code lê o CLAUDE.md, que não importa o AGENTS.md. Adicionar a linha @AGENTS.md a ele? [s/N] ',
      'Aplicar? [s/N] ',
    ])
  })

  it('should not ask to share and say nothing was written when every example is refused', async () => {
    const { run, questions, written, out } = setup(['no', 'no', 'no', 'no'])

    const code = await run()

    expect(code).toBe(EXIT.ok)
    expect(questions).toHaveLength(4)
    expect(out()).toBe('Nothing was written.\n')
    expect(written()).toEqual([])
  })

  it('should skip an example that is already on and refresh a current block without asking when another is switched on', async () => {
    const { run, questions, out, files, workspace } = setup(['yes', 'no', 'no', 'yes'])
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)

    await run()

    expect(questions.map((question) => question.split(':')[0])).toEqual([
      'Commit messages',
      'Review rubric',
      'Merge request description',
      'Apply? [y/N] ',
    ])
    expect(lines(out()).slice(0, 3)).toEqual([
      'Files to write:',
      '  .dck/standards/commit-message.md',
      '  AGENTS.md',
    ])
    expect(files.texts.get(AGENTS)).toContain('- Commit messages: ')
  })

  it('should ask to share again when the block is out of date', async () => {
    const { run, questions, workspace } = setup(['no', 'no', 'enter', 'yes'])
    await workspace.setEnabled('branch-format', true, 'repository')
    await workspace.shareWithAgents(true)
    await workspace.setEnabled('commit-message', true, 'repository')

    await run()

    expect(questions.at(-2)).toBe('Share the rules with agents in AGENTS.md? [Y/n] ')
    expect((await workspace.load()).agents.stale).toBe(false)
  })

  it('should list the file that already holds a standard and ask with its own reason when the repository overrides an example', async () => {
    const { run, questions, out, files } = setup(['yes', 'no', 'no', 'no', 'no', 'no'])
    files.texts.set(
      `${STANDARDS}/branches.md`,
      '---\nid: branch-format\nwhy: Our releases read the branch name.\nenabled: false\n---\n',
    )

    await run()

    expect(questions[0]).toBe('Branch names: Our releases read the branch name. Switch on? [Y/n] ')
    expect(lines(out())).toEqual([
      'Files to write:',
      '  .dck/standards/branches.md',
      'Nothing was written.',
    ])
  })

  it('should offer the import line when CLAUDE.md lacks it and add it only when the user says yes', async () => {
    const refused = setup(['yes', 'no', 'no', 'no', 'yes', 'enter', 'yes'])
    refused.files.texts.set(CLAUDE, '# Claude\n')
    const accepted = setup(['yes', 'no', 'no', 'no', 'yes', 'yes', 'yes'])
    accepted.files.texts.set(CLAUDE, '# Claude\n')

    await refused.run()
    await accepted.run()

    expect(refused.questions.at(-2)).toBe(
      'Claude Code reads CLAUDE.md, which does not import AGENTS.md. Add the @AGENTS.md line to it? [y/N] ',
    )
    expect(refused.files.texts.get(CLAUDE)).toBe('# Claude\n')
    expect(lines(accepted.out()).at(-2)).toBe('  CLAUDE.md')
    expect(accepted.files.texts.get(CLAUDE)).toBe('# Claude\n@AGENTS.md\n')
  })

  it.each([
    ['en', 'Everything is already set up.\n'],
    ['pt-BR', 'Tudo já está configurado.\n'],
  ] as const)(
    'should say everything is set up when there is nothing to ask and nothing to write (%s)',
    async (locale, message) => {
      const { run, questions, out, workspace } = setup([], locale)
      for (const id of ['branch-format', 'commit-message', 'review-rubric', 'mr-description']) {
        await workspace.setEnabled(id, true, 'repository')
      }
      await workspace.shareWithAgents(true)

      const code = await run()

      expect(code).toBe(EXIT.ok)
      expect(questions).toEqual([])
      expect(out()).toBe(message)
    },
  )

  it.each([
    [['--verbose'], EXIT.usage],
    [['--yes', 'now'], EXIT.usage],
    [['--help'], EXIT.ok],
  ])('should print the usage and write nothing when the arguments are %j', async (argv, exit) => {
    const { run, written, err } = setup()

    const code = await run(...argv)

    expect(code).toBe(exit)
    expect(err()).toBe('Usage: dck init [--yes] [--remove]\n')
    expect(written()).toEqual([])
  })

  it.each([
    ['en', 'Could not write the file: EROFS: read-only file system\n'],
    ['pt-BR', 'Não foi possível gravar o arquivo: EROFS: read-only file system\n'],
  ] as const)(
    'should print a translated error and exit as an internal error when a write fails (%s)',
    async (locale, message) => {
      const { run, err, files } = setup([], locale)
      files.writeText = async () => fail(errorBody('DCK-STD-002', 'EROFS: read-only file system'))

      const code = await run('--yes')

      expect(code).toBe(EXIT.software)
      expect(err()).toBe(message)
    },
  )
})

describe('dck init --yes', () => {
  it.each([
    ['en', 'Not inside a git repository\n'],
    ['pt-BR', 'Fora de um repositório git\n'],
  ] as const)(
    'should refuse and write nothing when the folder is not inside a git repository (%s)',
    async (locale, message) => {
      const { run, err, written } = setup([], locale, false)

      const code = await run('--yes')

      expect(code).toBe(EXIT.usage)
      expect(err()).toBe(message)
      expect(written()).toEqual([])
    },
  )
  it('should offer the examples for the repository and share them when the user folder already has them on', async () => {
    const { run, written, files, workspace } = setup()
    await workspace.setEnabled('branch-format', true, 'global')
    await workspace.setEnabled('commit-message', true, 'global')

    const code = await run('--yes')

    expect(code).toBe(EXIT.ok)
    expect(written()).toEqual([
      '.dck/standards/branch-format.md',
      '.dck/standards/commit-message.md',
      'AGENTS.md',
    ])
    expect(files.texts.get(AGENTS)).toContain('- Branch names:')
  })
  it('should switch on the recommended examples and share them without a question when --yes is given', async () => {
    const { run, questions, written, out, files, workspace } = setup()
    files.texts.set(CLAUDE, '# Claude\n')

    const code = await run('--yes')

    const { standards, agents } = await workspace.load()
    expect(code).toBe(EXIT.ok)
    expect(questions).toEqual([])
    expect(lines(out())).toEqual([
      'Files to write:',
      '  .dck/standards/branch-format.md',
      '  .dck/standards/commit-message.md',
      '  AGENTS.md',
      'Done. See what is on with: dck standards',
    ])
    expect(written()).toEqual([
      '.dck/standards/branch-format.md',
      '.dck/standards/commit-message.md',
      'AGENTS.md',
      'CLAUDE.md',
    ])
    expect(standards.filter((standard) => standard.enabled).map((standard) => standard.id)).toEqual(
      ['branch-format', 'commit-message'],
    )
    expect(agents).toMatchObject({ shared: true, stale: false, claudeImportMissing: true })
    expect(files.texts.get(CLAUDE)).toBe('# Claude\n')
  })

  it('should write the same bytes and say everything is set up when it runs twice (C4b)', async () => {
    const { run, out, files } = setup()
    files.texts.set(AGENTS, HANDWRITTEN)
    await run('--yes')
    const first = new Map(files.texts)

    const code = await run('--yes')

    expect(code).toBe(EXIT.ok)
    expect(new Map(files.texts)).toEqual(first)
    expect(lines(out()).at(-1)).toBe('Everything is already set up.')
  })
})

describe('dck init --remove', () => {
  it('should take the block out and leave the standards and the rest of the file alone when the removal is confirmed (C4b)', async () => {
    const { run, questions, written, out, files } = setup(['yes'])
    files.texts.set(AGENTS, HANDWRITTEN)
    await run('--yes')

    const code = await run('--remove')

    expect(code).toBe(EXIT.ok)
    expect(questions).toEqual(['Remove the dck block from AGENTS.md? [y/N] '])
    expect(lines(out()).at(-1)).toBe(
      'Block removed from AGENTS.md. The standards files were left alone.',
    )
    expect(files.texts.get(AGENTS)).toBe(HANDWRITTEN)
    expect(written()).toEqual([
      '.dck/standards/branch-format.md',
      '.dck/standards/commit-message.md',
      'AGENTS.md',
    ])
  })

  it.each([
    ['en', 'Nothing was written.'],
    ['pt-BR', 'Nada foi gravado.'],
  ] as const)(
    'should keep the block when the confirmation is refused (%s)',
    async (locale, message) => {
      const { run, out, files } = setup(['enter'], locale)
      await run('--yes')
      const shared = files.texts.get(AGENTS)

      const code = await run('--remove')

      expect(code).toBe(EXIT.ok)
      expect(lines(out()).at(-1)).toBe(message)
      expect(files.texts.get(AGENTS)).toBe(shared)
    },
  )

  it('should remove without a question when --yes is given too', async () => {
    const { run, questions, files } = setup()
    files.texts.set(AGENTS, HANDWRITTEN)
    await run('--yes')

    await run('--remove', '--yes')

    expect(questions).toEqual([])
    expect(files.texts.get(AGENTS)).toBe(HANDWRITTEN)
  })

  it.each([
    ['en', 'AGENTS.md has no dck block. Nothing to remove.\n'],
    ['pt-BR', 'AGENTS.md não tem o bloco do dck. Nada a remover.\n'],
  ] as const)(
    'should say there is nothing to remove when the file has no block (%s)',
    async (locale, message) => {
      const { run, questions, written, out } = setup([], locale)

      const code = await run('--remove')

      expect(code).toBe(EXIT.ok)
      expect(questions).toEqual([])
      expect(out()).toBe(message)
      expect(written()).toEqual([])
    },
  )
})
