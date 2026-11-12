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
import { align, EXIT, type Io, printable, rejection } from './output.ts'

export interface StandardsDeps {
  readonly workspace: StandardsWorkspace
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

export const STANDARDS_COMMANDS = ['standards', 'guide', 'check'] as const
export type StandardsCommand = (typeof STANDARDS_COMMANDS)[number]

const DEFAULT_BUDGET = 1500

function usage(io: Io, key: MessageKey, args: readonly string[]): number {
  io.err(`${io.t(key)}\n`)
  return args[0] === '--help' ? EXIT.ok : EXIT.usage
}

const staleLine = (loaded: LoadedStandards, t: Translate, relative: (path: string) => string) =>
  t('cli.standards.stale', { file: relative(loaded.agents.file) })

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
    ...(loaded.agents.stale ? ['', staleLine(loaded, t, relative)] : []),
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
  const changed = await deps.workspace.setEnabled(id, enabled, target)
  if (!changed.ok) {
    io.err(`${rejection(changed.error, io.t)}\n`)
    return EXIT.failed
  }
  const { standards, agents } = await deps.workspace.load()
  const layers = standards.find((standard) => standard.id === id)?.layers ?? []
  const path = deps.relative(deps.workspace.fileFor({ id, layers }, target))
  const key = enabled ? 'cli.standards.switchedOn' : 'cli.standards.switchedOff'
  io.out(`${io.t(key, { id, path })}\n`)
  // The block is dck's own and was approved when it was created, so it follows the standards
  if (agents.stale) {
    await deps.workspace.shareWithAgents(true)
    io.out(`${io.t('cli.standards.refreshed', { file: deps.relative(agents.file) })}\n`)
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
  io.out(`${text}\n`)
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
  if (loaded.agents.stale) io.err(`${staleLine(loaded, io.t, deps.relative)}\n`)
  return failures.length === 0 ? EXIT.ok : EXIT.failed
}

async function check(args: readonly string[], io: Io, deps: StandardsDeps): Promise<number> {
  const [application, file, ...extra] = args
  if (application === undefined || application.startsWith('-') || extra.length > 0) {
    return usage(io, 'cli.check.usage', args)
  }
  if (application === 'branch' && file === undefined) {
    const branch = await deps.currentBranch()
    // Outside a repository or on a detached HEAD there is no branch to check
    return branch === undefined ? EXIT.ok : report(application, branch, io, deps)
  }
  const text = await deps.readInput(file)
  if (text === undefined) {
    io.err(`${io.t('cli.check.unreadable', { file: file ?? '-' })}\n`)
    return EXIT.usage
  }
  // A branch name that is piped in ends with a newline
  const checked = application === 'branch' ? text.replace(/\r?\n$/, '') : text
  return report(application, checked, io, deps)
}

export async function runStandardsCommand(
  command: StandardsCommand,
  args: readonly string[],
  io: Io,
  deps: StandardsDeps,
): Promise<number> {
  if (command === 'guide') return guide(args, io, deps)
  if (command === 'check') return check(args, io, deps)
  try {
    return await standards(args, io, deps)
  } catch (error) {
    // The workspace only rejects when a file cannot be written
    io.err(`${io.t('cli.standards.writeFailed', { detail: String(error) })}\n`)
    return EXIT.software
  }
}
