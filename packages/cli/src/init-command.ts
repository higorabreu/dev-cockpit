import { BUILT_IN_RULES, type LoadedRules, ok, type ResolvedRule } from '@dck/core'
import { EXIT, type Io, notInRepository, printable, refused } from './output.ts'
import type { RulesDeps } from './rules-commands.ts'

type Choose = (question: string, fallback: boolean) => Promise<boolean>

interface Plan {
  readonly enable: readonly ResolvedRule[]
  // Write or refresh the block of the agents file
  readonly share: boolean
  readonly claudeImport: boolean
}

function cancelled(io: Io): number {
  io.out(`${io.t('cli.init.cancelled')}\n`)
  return EXIT.ok
}

async function plan(loaded: LoadedRules, choose: Choose, io: Io, file: string): Promise<Plan> {
  // The block only states what the repository holds, so a rule on in the user's folder is offered too
  const isOnHere = (rule: ResolvedRule) =>
    rule.enabled && rule.layers.at(-1)?.source === 'repository'
  const enable: ResolvedRule[] = []
  for (const { recommended, rule: example } of BUILT_IN_RULES) {
    const rule = loaded.rules.find((candidate) => candidate.id === example.id)
    if (rule === undefined || isOnHere(rule)) continue
    const { title, why } = rule
    const question = io.t('cli.init.switchOn', { title, why: why.replace(/\.$/, '') })
    if (await choose(printable(question), recommended)) enable.push(rule)
  }
  const { shared, stale, claudeImportMissing } = loaded.agents
  const anyOn = enable.length > 0 || loaded.rules.some(isOnHere)
  // A current block is dck's own and already approved: it only follows what was just switched on
  const share =
    anyOn &&
    (shared && !stale ? enable.length > 0 : await choose(io.t('cli.init.share', { file }), true))
  const claudeImport =
    claudeImportMissing && (share || shared) && (await choose(io.t('cli.init.claudeImport'), false))
  return { enable, share, claudeImport }
}

const filesOf = ({ enable, share, claudeImport }: Plan, agentsFile: string, deps: RulesDeps) => [
  ...enable.map((rule) => deps.relative(deps.workspace.fileFor(rule, 'repository'))),
  ...(share ? [agentsFile] : []),
  ...(claudeImport ? ['CLAUDE.md'] : []),
]

async function apply({ enable, share, claudeImport }: Plan, io: Io, deps: RulesDeps) {
  for (const { id } of enable) {
    const changed = await deps.workspace.setEnabled(id, true, 'repository')
    if (!changed.ok) return refused(io, changed.error)
  }
  const shared = share ? await deps.workspace.shareWithAgents(true) : ok(undefined)
  if (!shared.ok) return refused(io, shared.error)
  const imported = claudeImport ? await deps.workspace.addClaudeImport() : ok(undefined)
  if (!imported.ok) return refused(io, imported.error)
  io.out(`${io.t('cli.init.done')}\n`)
  return EXIT.ok
}

async function remove(approve: (question: string) => Promise<boolean>, io: Io, deps: RulesDeps) {
  const { agents } = await deps.workspace.load()
  const file = printable(deps.relative(agents.file))
  if (!agents.shared) {
    io.out(`${io.t('cli.init.noBlock', { file })}\n`)
    return EXIT.ok
  }
  if (!(await approve(io.t('cli.init.remove', { file })))) return cancelled(io)
  const removed = await deps.workspace.shareWithAgents(false)
  if (!removed.ok) return refused(io, removed.error)
  io.out(`${io.t('cli.init.removed', { file })}\n`)
  return EXIT.ok
}

export async function runInit(args: readonly string[], io: Io, deps: RulesDeps) {
  if (args.some((arg) => arg !== '--yes' && arg !== '--remove')) {
    io.err(`${io.t('cli.init.usage')}\n`)
    return args.includes('--help') ? EXIT.ok : EXIT.usage
  }
  if (!deps.inRepository) return notInRepository(io)
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
  const agentsFile = printable(deps.relative(loaded.agents.file))
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
