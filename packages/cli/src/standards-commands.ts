import {
  checkText,
  type ExtensionSource,
  type LoadedStandards,
  type Matcher,
  type MessageKey,
  renderGuide,
  type StandardsWorkspace,
  type Translate,
} from '@dck/core'
import { runInit } from './init-command.ts'
import {
  align,
  EXIT,
  type Io,
  notInRepository,
  printable,
  printableText,
  refused,
  rejection,
} from './output.ts'

export interface StandardsDeps {
  readonly workspace: StandardsWorkspace
  // Outside a git repository nothing is written to the current directory
  readonly inRepository: boolean
  // Undefined outside a repository or on a detached HEAD
  currentBranch(): Promise<string | undefined>
  // The text of a file, or of the standard input for no file or `-`; undefined when it cannot be read
  readInput(file: string | undefined): Promise<string | undefined>
  // Runs the expression of a rule with a time limit
  readonly match: Matcher
  // A yes or no question; an empty answer is the fallback
  confirm(question: string, fallback: boolean): Promise<boolean>
  // A path as it is printed: relative to the repository when it is inside it
  relative(path: string): string
}

export const STANDARDS_COMMANDS = ['init', 'standards', 'guide', 'check'] as const
export type StandardsCommand = (typeof STANDARDS_COMMANDS)[number]

const DEFAULT_BUDGET = 1500

function usage(io: Io, key: MessageKey, args: readonly string[]): number {
  io.err(`${io.t(key)}\n`)
  return args.includes('--help') ? EXIT.ok : EXIT.usage
}

export function formatStandardsList(
  loaded: LoadedStandards,
  t: Translate,
  relative: (path: string) => string,
): string[] {
  const source = (layer: { source: ExtensionSource }) => t(`cli.ext.source.${layer.source}`)
  const rows = loaded.standards.map(({ id, applies, enabled, layers }) => {
    const [top = '', ...below] = layers.map(source).reverse()
    const sources = [...new Set(below)].join(', ')
    const overrides = sources === '' ? [] : [t('cli.standards.overrides', { sources })]
    return [id, applies, t(enabled ? 'cli.standards.on' : 'cli.standards.off'), top, ...overrides]
  })
  // The detail of an invalid file starts with its absolute path, which the row already shows
  const invalid = loaded.invalid.map(({ path, error }) => [
    relative(path),
    rejection(error, t).replace(`${path}: `, ''),
  ])
  return [
    ...align(rows),
    ...(invalid.length === 0 ? [] : ['', t('cli.standards.invalid')]),
    ...align(invalid).map((line) => `  ${line}`),
    ...(loaded.agents.stale
      ? ['', t('cli.standards.stale', { file: printable(relative(loaded.agents.file)) })]
      : []),
  ]
}

async function list(io: Io, deps: StandardsDeps): Promise<number> {
  const loaded = await deps.workspace.load()
  // An invalid file is part of the listing, not a failure of the command
  io.out(`${formatStandardsList(loaded, io.t, deps.relative).join('\n')}\n`)
  return EXIT.ok
}

async function switchStandard(
  enabled: boolean,
  args: readonly string[],
  io: Io,
  deps: StandardsDeps,
): Promise<number> {
  const target = args.includes('--global') ? 'global' : 'repository'
  const [id, ...extra] = args.filter((arg) => arg !== '--global')
  if (id === undefined || id.startsWith('-') || extra.length > 0) {
    return usage(io, 'cli.standards.usage', args)
  }
  if (target === 'repository' && !deps.inRepository) return notInRepository(io)
  const changed = await deps.workspace.setEnabled(id, enabled, target)
  if (!changed.ok) return refused(io, changed.error)
  const { standards, agents } = await deps.workspace.load()
  const standard = standards.find((candidate) => candidate.id === id)
  const path = deps.relative(deps.workspace.fileFor({ id, layers: standard?.layers ?? [] }, target))
  const key = enabled ? 'cli.standards.switchedOn' : 'cli.standards.switchedOff'
  io.out(`${printable(io.t(key, { id, path }))}\n`)
  if (enabled && standard?.enabled === false) {
    io.out(`${printable(io.t('cli.standards.repositoryOff', { id }))}\n`)
  }
  // The block is dck's own and was approved when it was created, so it follows the standards
  if (agents.stale) {
    const shared = await deps.workspace.shareWithAgents(true)
    if (!shared.ok) return refused(io, shared.error)
    io.out(`${io.t('cli.standards.refreshed', { file: printable(deps.relative(agents.file)) })}\n`)
  }
  return EXIT.ok
}

async function standards(args: readonly string[], io: Io, deps: StandardsDeps): Promise<number> {
  const [subcommand, ...rest] = args
  if (subcommand === 'enable' || subcommand === 'disable') {
    return switchStandard(subcommand === 'enable', rest, io, deps)
  }
  if (args.length === 0 || (subcommand === 'list' && rest.length === 0)) return list(io, deps)
  return usage(io, 'cli.standards.usage', args)
}

async function guide(args: readonly string[], io: Io, deps: StandardsDeps): Promise<number> {
  const at = args.indexOf('--budget')
  const budget = at === -1 ? DEFAULT_BUDGET : Number(args[at + 1])
  const [application, ...extra] = at === -1 ? args : args.toSpliced(at, 2)
  const known = application !== undefined && !application.startsWith('-') && extra.length === 0
  // Also refuses a missing or non-numeric budget, which is NaN
  if (!known || !(budget > 0)) return usage(io, 'cli.guide.usage', args)
  const { text, count, lines, tokens } = renderGuide(
    (await deps.workspace.load()).standards,
    application,
  )
  if (count === 0) {
    io.err(`${io.t('cli.guide.empty', { application })}\n`)
    return EXIT.ok
  }
  // The text goes to the standard output alone, so it can be piped into a file or an agent
  io.out(`${printableText(text)}\n`)
  io.err(`${io.t('cli.guide.size', { count, lines, tokens })}\n`)
  if (tokens > budget) io.err(`${io.t('cli.guide.overBudget', { budget })}\n`)
  return EXIT.ok
}

async function report(
  application: string,
  text: string,
  io: Io,
  deps: StandardsDeps,
): Promise<number> {
  const loaded = await deps.workspace.load()
  const failures = checkText(loaded.standards, application, text, { match: deps.match })
  for (const { title, message, kind } of failures) {
    const note = kind === 'timeout' ? ` (${io.t('cli.check.timeout')})` : ''
    io.err(`${printable(`${title}: ${message}`)}${note}\n`)
  }
  return failures.length === 0 ? EXIT.ok : EXIT.failed
}

async function check(args: readonly string[], io: Io, deps: StandardsDeps): Promise<number> {
  const [application, file, ...extra] = args
  const invalid = application === undefined || application.startsWith('-') || extra.length > 0
  if (invalid || args.includes('--help')) {
    return usage(io, 'cli.check.usage', args)
  }
  if (application === 'branch' && file === undefined) {
    const branch = await deps.currentBranch()
    // Outside a repository or on a detached HEAD there is no branch to check
    return branch === undefined ? EXIT.ok : report(application, branch, io, deps)
  }
  const text = await deps.readInput(file)
  if (text === undefined) {
    io.err(`${io.t('cli.check.unreadable', { file: printable(file ?? '-') })}\n`)
    return EXIT.usage
  }
  return report(application, text, io, deps)
}

export async function runStandardsCommand(
  command: StandardsCommand,
  args: readonly string[],
  io: Io,
  deps: StandardsDeps,
): Promise<number> {
  if (command === 'guide') return guide(args, io, deps)
  if (command === 'check') return check(args, io, deps)
  return command === 'init' ? runInit(args, io, deps) : standards(args, io, deps)
}
