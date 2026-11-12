import { BUILT_IN_STANDARDS, type LoadedStandards, type ResolvedStandard } from '@dck/core'
import { EXIT, type Io, printable, rejection } from './output.ts'
import type { StandardsDeps } from './standards-commands.ts'

type Choose = (question: string, fallback: boolean) => Promise<boolean>

interface Plan {
  readonly enable: readonly ResolvedStandard[]
  // Write or refresh the block of the agents file
  readonly share: boolean
  readonly claudeImport: boolean
}

function cancelled(io: Io): number {
  io.out(`${io.t('cli.init.cancelled')}\n`)
  return EXIT.ok
}

async function plan(loaded: LoadedStandards, choose: Choose, io: Io, file: string): Promise<Plan> {
  const enable: ResolvedStandard[] = []
  for (const { recommended, standard: example } of BUILT_IN_STANDARDS) {
    const standard = loaded.standards.find((candidate) => candidate.id === example.id)
    if (standard === undefined || standard.enabled) continue
    const { title, why } = standard
    const question = io.t('cli.init.switchOn', { title, why: why.replace(/\.$/, '') })
    if (await choose(printable(question), recommended)) enable.push(standard)
  }
  const { shared, stale, claudeImportMissing } = loaded.agents
  const anyOn = enable.length > 0 || loaded.standards.some((standard) => standard.enabled)
  // A current block is dck's own and already approved: it only follows what was just switched on
  const share =
    shared && !stale
      ? enable.length > 0
      : (anyOn || shared) && (await choose(io.t('cli.init.share', { file }), true))
  const claudeImport =
    claudeImportMissing && (share || shared) && (await choose(io.t('cli.init.claudeImport'), false))
  return { enable, share, claudeImport }
}

const filesOf = (
  { enable, share, claudeImport }: Plan,
  agentsFile: string,
  deps: StandardsDeps,
) => [
  ...enable.map((standard) => deps.relative(deps.workspace.fileFor(standard, 'repository'))),
  ...(share ? [agentsFile] : []),
  ...(claudeImport ? ['CLAUDE.md'] : []),
]

async function apply({ enable, share, claudeImport }: Plan, io: Io, deps: StandardsDeps) {
  for (const { id } of enable) {
    const changed = await deps.workspace.setEnabled(id, true, 'repository')
    if (!changed.ok) {
      io.err(`${rejection(changed.error, io.t)}\n`)
      return EXIT.failed
    }
  }
  if (share) await deps.workspace.shareWithAgents(true)
  if (claudeImport) await deps.workspace.addClaudeImport()
  io.out(`${io.t('cli.init.done')}\n`)
  return EXIT.ok
}

async function remove(
  approve: (question: string) => Promise<boolean>,
  io: Io,
  deps: StandardsDeps,
) {
  const { agents } = await deps.workspace.load()
  const file = deps.relative(agents.file)
  if (!agents.shared) {
    io.out(`${io.t('cli.init.noBlock', { file })}\n`)
    return EXIT.ok
  }
  if (!(await approve(io.t('cli.init.remove', { file })))) return cancelled(io)
  await deps.workspace.shareWithAgents(false)
  io.out(`${io.t('cli.init.removed', { file })}\n`)
  return EXIT.ok
}

export async function runInit(args: readonly string[], io: Io, deps: StandardsDeps) {
  if (args.some((arg) => arg !== '--yes' && arg !== '--remove')) {
    io.err(`${io.t('cli.init.usage')}\n`)
    return args[0] === '--help' ? EXIT.ok : EXIT.usage
  }
  const yes = args.includes('--yes')
  let asked = false
  const ask: Choose = (question, fallback) => {
    asked = true
    const hint = io.t(fallback ? 'cli.init.yesDefault' : 'cli.init.noDefault')
    return deps.confirm(`${question} ${hint} `, fallback)
  }
  // --yes takes the answer each question shows as its default, and approves the writing
  const choose: Choose = async (question, fallback) => (yes ? fallback : ask(question, fallback))
  const approve = async (question: string) => yes || ask(question, false)
  if (args.includes('--remove')) return remove(approve, io, deps)

  const loaded = await deps.workspace.load()
  const agentsFile = deps.relative(loaded.agents.file)
  const chosen = await plan(loaded, choose, io, agentsFile)
  const files = filesOf(chosen, agentsFile, deps)
  if (files.length === 0) {
    io.out(`${io.t(asked ? 'cli.init.cancelled' : 'cli.init.nothing')}\n`)
    return EXIT.ok
  }
  io.out(`${io.t('cli.init.files')}\n${files.map((file) => `  ${printable(file)}`).join('\n')}\n`)
  if (!(await approve(io.t('cli.init.apply')))) return cancelled(io)
  return apply(chosen, io, deps)
}
