import {
  BUILT_IN_EXTENSION_ID,
  builtInExtension,
  CONTRIBUTION_POINTS,
  createTranslator,
  EXTENSION_API_VERSION,
  type ExtensionCandidate,
  type ExtensionSource,
  type Locale,
  loadExtensions,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { EXIT, runCli } from './cli.ts'
import { formatExtensionList, runExtCommand, type SaveDisabled } from './ext-commands.ts'

const APP_VERSION = '0.3.0'

const candidate = (
  source: ExtensionSource,
  location: string,
  overrides: Record<string, unknown> = {},
): ExtensionCandidate => ({
  source,
  location,
  manifest: {
    id: 'acme.commits',
    name: 'Commits',
    version: '1.0.0',
    apiVersion: 1,
    engines: { dck: '>=0.3.0' },
    ...overrides,
  },
})

const everySource = [
  candidate('repository', '/home/ana/work/backend/.dck', { id: 'acme.backend', version: '0.1.0' }),
  candidate('global', '/home/ana/.config/dck/global', { id: 'ana.personal', version: '2.0.0' }),
  candidate('installed', '/home/ana/.config/dck/extensions/acme.commits'),
]

const report = (candidates: readonly ExtensionCandidate[], disabled: string[] = []) =>
  loadExtensions({
    candidates: [builtInExtension(APP_VERSION), ...candidates],
    points: CONTRIBUTION_POINTS,
    disabled: new Set(disabled),
    apiVersion: EXTENSION_API_VERSION,
    appVersion: APP_VERSION,
  })

function setup(
  candidates: readonly ExtensionCandidate[],
  options: { disabled?: string[]; locale?: Locale; save?: SaveDisabled } = {},
) {
  const out: string[] = []
  const err: string[] = []
  const saved: string[][] = []
  const io = {
    out: (text: string) => void out.push(text),
    err: (text: string) => void err.push(text),
    t: createTranslator(options.locale ?? 'en').t,
  }
  const deps = {
    finder: { find: async () => candidates },
    disabled: async () => new Set(options.disabled ?? []),
    saveDisabled: async (ids: ReadonlySet<string>) => {
      saved.push([...ids])
      return options.save ?? { kind: 'saved' as const }
    },
    appVersion: APP_VERSION,
  }
  return { run: (args: string[]) => runExtCommand(args, io, deps), deps, out, err, saved }
}

describe('formatExtensionList', () => {
  const en = createTranslator('en').t

  it('should list one aligned row per extension from the lowest to the highest source when all four sources contribute', () => {
    const loaded = report(everySource)

    const lines = formatExtensionList(loaded, en)

    expect(lines).toEqual([
      'dck.built-in  0.3.0  built-in    active',
      'acme.commits  1.0.0  installed   active',
      'ana.personal  2.0.0  global      active',
      'acme.backend  0.1.0  repository  active',
    ])
  })

  it('should mark the extension as disabled when its id is in the disabled list', () => {
    const loaded = report(everySource, ['acme.commits'])

    const lines = formatExtensionList(loaded, en)

    expect(lines[1]).toBe('acme.commits  1.0.0  installed   disabled')
    expect(lines).toHaveLength(4)
  })

  it('should show the shadowed copy with its source, the winning source and its location when a higher source repeats the id', () => {
    const loaded = report([
      candidate('installed', '/home/ana/.config/dck/extensions/acme.commits', { version: '0.9.0' }),
      candidate('repository', '/home/ana/work/backend/.dck'),
    ])

    const lines = formatExtensionList(loaded, en)

    expect(lines).toEqual([
      'dck.built-in  0.3.0  built-in    active',
      'acme.commits  1.0.0  repository  active',
      'acme.commits  0.9.0  installed   shadowed by repository  /home/ana/.config/dck/extensions/acme.commits',
    ])
  })

  it('should list a refused extension with its location, the translated message and the detail when a manifest is invalid', () => {
    const loaded = report([
      candidate('installed', '/home/ana/.config/dck/extensions/broken', { id: 'Broken' }),
      candidate('global', '/home/ana/.config/dck/global', { id: 'ana.next', apiVersion: 2 }),
    ])

    const lines = formatExtensionList(loaded, en)

    expect(lines).toEqual([
      'dck.built-in  0.3.0  built-in  active',
      '',
      'Rejected:',
      '  /home/ana/.config/dck/extensions/broken  installed  Invalid extension manifest: id: must look like owner.name, in lowercase',
      '  /home/ana/.config/dck/global             global     Extension not compatible with this version: ana.next needs API 2, this version supports 1',
    ])
  })

  it('should show only the message when the error has no detail', () => {
    const loaded = {
      ...report([]),
      rejected: [
        {
          source: 'installed' as const,
          location: '/home/ana/.config/dck/extensions/broken',
          error: {
            code: -32014,
            message: 'Invalid extension manifest',
            data: { code: 'DCK-EXT-001' },
          },
        },
      ],
    }

    const lines = formatExtensionList(loaded, en)

    expect(lines.at(-1)).toBe(
      '  /home/ana/.config/dck/extensions/broken  installed  Invalid extension manifest',
    )
  })

  it('should translate the sources, the states and the error message when the locale is pt-BR', () => {
    const loaded = report(
      [
        candidate('installed', '/home/ana/.config/dck/extensions/acme.commits'),
        candidate('repository', '/home/ana/work/backend/.dck'),
        candidate('global', '/home/ana/.config/dck/global', { id: 'ana.personal' }),
        candidate('installed', '/home/ana/.config/dck/extensions/broken', { main: 'index.js' }),
      ],
      ['ana.personal'],
    )

    const lines = formatExtensionList(loaded, createTranslator('pt-BR').t)

    expect(lines).toEqual([
      'dck.built-in  0.3.0  embutida     ativa',
      'ana.personal  1.0.0  global       desativada',
      'acme.commits  1.0.0  repositório  ativa',
      'acme.commits  1.0.0  instalada    sobreposta por repositório  /home/ana/.config/dck/extensions/acme.commits',
      '',
      'Recusadas:',
      '  /home/ana/.config/dck/extensions/broken  instalada  Recurso de extensão não suportado por esta versão: this version cannot run code: main',
    ])
  })
})

describe('formatExtensionList with hostile text', () => {
  it('should replace control characters when a manifest or a folder name carries them', () => {
    const forged = '\u001b[2J\nacme.fake  1.0.0  built-in  active'
    const hostile = candidate('installed', '/home/ana/extensions/bad\nfolder', { [forged]: true })

    const lines = formatExtensionList(report([hostile]), createTranslator('en').t)

    expect(lines).toHaveLength(4)
    expect([...lines.join('')].every((char) => char >= ' ' && char !== '\u007f')).toBe(true)
    expect(lines.at(-1)).toContain('/home/ana/extensions/bad?folder')
  })

  it('should start at the rejected title when no extension loaded', () => {
    const broken = { source: 'installed' as const, location: '/home/ana/extensions/x', manifest: 1 }
    const empty = loadExtensions({
      candidates: [broken],
      points: CONTRIBUTION_POINTS,
      disabled: new Set(),
      apiVersion: EXTENSION_API_VERSION,
      appVersion: APP_VERSION,
    })

    const lines = formatExtensionList(empty, createTranslator('en').t)

    expect(lines[0]).toBe('Rejected:')
  })
})

describe('runExtCommand', () => {
  it('should print the usage and succeed when help is asked', async () => {
    const { run, err } = setup([])

    const code = await run(['--help'])

    expect(code).toBe(EXIT.ok)
    expect(err.join('')).toBe('Usage: dck ext list | enable <id> | disable <id>\n')
  })

  it('should show only the built-in extensions with their source when nothing else is found', async () => {
    const cli = setup([])

    const code = await cli.run(['list'])

    expect(code).toBe(EXIT.ok)
    expect(cli.out.join('')).toBe(
      `${BUILT_IN_EXTENSION_ID}  0.3.0  built-in  active\ndck.gitlab    0.3.0  built-in  active\ndck.jira      0.3.0  built-in  active\n`,
    )
    expect(cli.err).toEqual([])
  })

  it('should print what the finder found and the disabled state when listing', async () => {
    const cli = setup(everySource, { disabled: ['ana.personal'] })

    const code = await cli.run(['list'])

    expect(code).toBe(EXIT.ok)
    expect(cli.out.join('')).toBe(
      [
        'dck.built-in  0.3.0  built-in    active',
        'dck.gitlab    0.3.0  built-in    active',
        'dck.jira      0.3.0  built-in    active',
        'acme.commits  1.0.0  installed   active',
        'ana.personal  2.0.0  global      disabled',
        'acme.backend  0.1.0  repository  active',
        '',
      ].join('\n'),
    )
  })

  it('should still exit successfully when an extension is refused', async () => {
    const cli = setup([
      candidate('installed', '/home/ana/.config/dck/extensions/broken', { id: 1 }),
    ])

    const code = await cli.run(['list'])

    expect(code).toBe(EXIT.ok)
    expect(cli.out.join('')).toContain('Rejected:\n  /home/ana/.config/dck/extensions/broken')
  })

  it('should print the listing in portuguese when the translator is pt-BR', async () => {
    const cli = setup([], { locale: 'pt-BR' })

    await cli.run(['list'])

    expect(cli.out.join('')).toBe(
      'dck.built-in  0.3.0  embutida  ativa\ndck.gitlab    0.3.0  embutida  ativa\ndck.jira      0.3.0  embutida  ativa\n',
    )
  })

  it('should print the usage and fail when the subcommand is unknown', async () => {
    const cli = setup([])

    const code = await cli.run(['voar'])

    expect(code).toBe(EXIT.usage)
    expect(cli.err.join('')).toBe('Usage: dck ext list | enable <id> | disable <id>\n')
    expect(cli.out).toEqual([])
  })

  it('should print the usage and fail when no subcommand is given', async () => {
    const cli = setup([], { locale: 'pt-BR' })

    const code = await cli.run([])

    expect(code).toBe(EXIT.usage)
    expect(cli.err.join('')).toBe('Uso: dck ext list | enable <id> | disable <id>\n')
  })
})

describe('runExtCommand enable and disable', () => {
  it('should add the id to the disabled list and say so when an extension is disabled', async () => {
    const cli = setup([])

    const code = await cli.run(['disable', 'dck.gitlab'])

    expect(code).toBe(EXIT.ok)
    expect(cli.saved).toEqual([['dck.gitlab']])
    expect(cli.out.join('')).toBe('dck.gitlab disabled\n')
  })

  it('should take the id out of the disabled list when the extension is enabled again', async () => {
    const cli = setup([], { disabled: ['acme.commits', 'dck.gitlab'] })

    const code = await cli.run(['enable', 'dck.gitlab'])

    expect(code).toBe(EXIT.ok)
    expect(cli.saved).toEqual([['acme.commits']])
    expect(cli.out.join('')).toBe('dck.gitlab enabled\n')
  })

  it('should write nothing and still succeed when the extension already is in that state', async () => {
    const cli = setup([], { disabled: ['dck.gitlab'] })

    const disabled = await cli.run(['disable', 'dck.gitlab'])
    const enabled = await cli.run(['enable', 'dck.built-in'])

    expect([disabled, enabled]).toEqual([EXIT.ok, EXIT.ok])
    expect(cli.saved).toEqual([])
  })

  it('should enable an id left in the list when its extension is gone', async () => {
    const cli = setup([], { disabled: ['acme.removed'] })

    const code = await cli.run(['enable', 'acme.removed'])

    expect(code).toBe(EXIT.ok)
    expect(cli.saved).toEqual([[]])
  })

  it('should refuse and write nothing when no extension has the id', async () => {
    const cli = setup([], { locale: 'pt-BR' })

    const code = await cli.run(['disable', 'dck.gitlb'])

    expect(code).toBe(EXIT.usage)
    expect(cli.err.join('')).toBe('Nenhuma extensão tem o id dck.gitlb. Veja dck ext list.\n')
    expect(cli.saved).toEqual([])
  })

  it('should fail and name the file when the settings file is not valid json', async () => {
    const cli = setup([], {
      save: { kind: 'invalid', file: '/home/ana/.config/dev-cockpit/settings.json' },
    })

    const code = await cli.run(['disable', 'dck.gitlab'])

    expect(code).toBe(EXIT.failed)
    expect(cli.err.join('')).toBe(
      'The settings file is not valid JSON, so it was left as it is: /home/ana/.config/dev-cockpit/settings.json\n',
    )
    expect(cli.out).toEqual([])
  })

  it.each([
    ['no id', ['disable']],
    ['two ids', ['enable', 'dck.gitlab', 'dck.built-in']],
  ])('should print the usage and fail when the command has %s', async (_label, args) => {
    const cli = setup([])

    expect(await cli.run(args)).toBe(EXIT.usage)
    expect(cli.saved).toEqual([])
  })
})

describe('runExtCommand with connectors from other sources', () => {
  it('should list an installed extension that contributes a connector as rejected with the reason', async () => {
    const connector = {
      id: 'tracker',
      name: 'Acme Tracker',
      connection: {
        address: { placeholder: 'https://tracker.example.com' },
        token: { label: 'connections.gitlab.token', hint: 'connections.gitlab.token.hint' },
      },
      views: [
        {
          id: 'tasks',
          kind: 'issue',
          title: 'views.review',
          description: 'views.review.description',
          empty: 'views.empty.review',
        },
      ],
    }
    const cli = setup([
      candidate('installed', '/home/ana/.config/dev-cockpit/extensions/acme.tracker', {
        id: 'acme.tracker',
        contributes: { connectors: [connector] },
      }),
    ])

    await cli.run(['list'])

    expect(cli.out.join('')).toContain(
      'Rejected:\n  /home/ana/.config/dev-cockpit/extensions/acme.tracker  installed  Extension feature not supported by this version: acme.tracker contributes connectors, which only built-in extensions can do in this version\n',
    )
  })
})

describe('runCli with ext', () => {
  const cliDeps = (ext: ReturnType<typeof setup>) => ({
    endpoint: '/home/ana/unused.sock',
    connect: async () => {
      throw new Error('invariant: ext list must not reach the daemon')
    },
    out: (text: string) => void ext.out.push(text),
    err: (text: string) => void ext.err.push(text),
    t: createTranslator('en').t,
  })

  it('should dispatch ext list without connecting to the daemon when the ext commands are available', async () => {
    const cli = setup([])

    const code = await runCli(['ext', 'list'], { ...cliDeps(cli), ext: cli.deps })

    expect(code).toBe(EXIT.ok)
    expect(cli.out.join('')).toContain('dck.built-in')
  })

  it('should show the ext line in the usage when the ext commands are available', async () => {
    const cli = setup([])

    await runCli([], { ...cliDeps(cli), ext: cli.deps })

    expect(cli.err.join('')).toContain('  ext ')
  })

  it('should leave the ext command out of the usage when the ext commands are not available', async () => {
    const cli = setup([])

    const code = await runCli(['ext', 'list'], cliDeps(cli))

    expect(code).toBe(EXIT.usage)
    expect(cli.err.join('')).not.toContain('  ext ')
  })
})
