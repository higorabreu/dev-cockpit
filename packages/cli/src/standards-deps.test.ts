import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createTranslator, silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EXIT, runCli } from './cli.ts'
import { createStandardsDeps } from './standards-deps.ts'

let root = ''
let repository = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-standards-'))
  repository = join(root, 'backend')
  await mkdir(repository)
})

afterEach(() => rm(root, { recursive: true, force: true }))

function setup(options: { answers?: string[]; stdin?: string } = {}) {
  const answers = [...(options.answers ?? [])]
  const out: string[] = []
  const err: string[] = []
  const deps = createStandardsDeps({
    configDir: join(root, 'config'),
    repositoryRoot: repository,
    appVersion: '0.3.0',
    logger: silentLogger,
    readFile: (path) => readFile(path, 'utf8').catch(() => undefined),
    readStdin: async () => options.stdin ?? '',
    ask: async () => answers.shift() ?? '',
  })
  const run = (...argv: string[]) =>
    runCli(argv, {
      endpoint: '',
      t: createTranslator('en').t,
      connect: () =>
        Promise.reject(new Error('invariant: the standards must not reach the daemon')),
      out: (text) => void out.push(text),
      err: (text) => void err.push(text),
      standards: deps,
    })
  return { deps, run, out: () => out.join(''), err: () => err.join('') }
}

describe('createStandardsDeps', () => {
  it.each([
    ['y', false, true],
    ['YES', false, true],
    ['s', false, true],
    ['Sim', false, true],
    [' y ', false, true],
    ['n', true, false],
    ['maybe', true, false],
    ['', true, true],
    ['', false, false],
  ])(
    'should read the answer %j with the fallback %s as %s when confirming',
    async (answer, fallback, expected) => {
      const { deps } = setup({ answers: [answer] })

      const confirmed = await deps.confirm('Apply? ', fallback)

      expect(confirmed).toBe(expected)
    },
  )

  it('should print a path relative to the repository when it is inside it and whole when it is not', () => {
    const { deps } = setup()

    const inside = deps.relative(join(repository, '.dck', 'standards', 'branch-format.md'))
    const outside = deps.relative(join(root, 'config', 'standards', 'branch-format.md'))

    expect(inside).toBe(join('.dck', 'standards', 'branch-format.md'))
    expect(outside).toBe(join(root, 'config', 'standards', 'branch-format.md'))
  })

  it('should read the standard input for no file or a dash, a file otherwise, and nothing when the file is missing', async () => {
    const { deps } = setup({ stdin: 'from the input' })
    await writeFile(join(root, 'message.txt'), 'from the file')

    const texts = await Promise.all([
      deps.readInput(undefined),
      deps.readInput('-'),
      deps.readInput(join(root, 'message.txt')),
      deps.readInput(join(root, 'missing.txt')),
    ])

    expect(texts).toEqual(['from the input', 'from the input', 'from the file', undefined])
  })

  it('should check the branch of a real repository and have nothing to check outside one', async () => {
    const { run, err } = setup()
    await run('standards', 'enable', 'branch-format')

    const outside = await run('check', 'branch')
    await promisify(execFile)('git', ['init', '--quiet', '-b', 'Feature/Add_Login', repository])
    const inside = await run('check', 'branch')

    expect([outside, inside]).toEqual([EXIT.ok, EXIT.failed])
    expect(err()).toMatch(/^Branch names: Use <type>\/<short-slug> in lowercase.*\n$/)
  })
})
