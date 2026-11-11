import {
  type CommandParts,
  planInstall,
  planUninstall,
  type Settings,
} from '@dck/adapter-agent-claude'
import {
  createClient,
  type ErrorBody,
  type Result,
  type Translator,
  type Transport,
} from '@dck/core'

export interface AgentDeps {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly t: Translator['t']
  readStdin(): Promise<string>
  // Roda o statusLine que o usuário já tinha, com a mesma entrada, e devolve o que ele imprimiu
  forward(command: string, input: string): Promise<string>
  readonly settingsPath: string
  readSettings(path: string): Promise<string | undefined>
  writeSettings(path: string, text: string): Promise<void>
  // Copia o arquivo antes de alterar e diz onde ficou a cópia
  backup(path: string): Promise<string>
  confirm(question: string): Promise<boolean>
  readonly commandParts: CommandParts
}

interface Io {
  readonly endpoint: string
  connect(endpoint: string): Promise<Result<Transport, ErrorBody>>
  out(text: string): void
  err(text: string): void
}

const EXIT_OK = 0
const EXIT_FAILED = 1
const EXIT_USAGE = 64

function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// Sempre sai com 0: o Claude Code chama isto a cada resposta e não pode ser incomodado
async function report(args: readonly string[], io: Io, deps: AgentDeps): Promise<number> {
  const input = await deps.readStdin()
  const forward = flag(args, '--forward')
  if (forward) io.out(await deps.forward(forward, input))

  const agent = flag(args, '--agent')
  const ptyId = Number(deps.env.DCK_PTY_ID)
  // Fora de um terminal do cockpit não há aba a que ligar o dado
  if (!agent || !Number.isInteger(ptyId)) return EXIT_OK

  const payload = parseJson(input)
  if (payload === undefined) {
    io.err(`${deps.t('cli.agent.reportInvalid')}\n`)
    return EXIT_OK
  }
  const connected = await io.connect(io.endpoint)
  // Sem daemon o cockpit está fechado: é o caso normal, não um erro
  if (!connected.ok) return EXIT_OK
  const client = createClient(connected.value)
  try {
    await client.request('agent.report', { agent, ptyId, payload })
  } finally {
    client.close()
  }
  return EXIT_OK
}

async function change(
  action: 'install' | 'uninstall',
  args: readonly string[],
  io: Io,
  deps: AgentDeps,
): Promise<number> {
  const { t } = deps
  const text = await deps.readSettings(deps.settingsPath)
  const settings: unknown = text === undefined ? {} : parseJson(text)
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    io.err(`${t('cli.agent.settingsInvalid', { path: deps.settingsPath })}\n`)
    return EXIT_FAILED
  }

  const install =
    action === 'install' ? planInstall(settings as Settings, deps.commandParts) : undefined
  const plan = install ?? planUninstall(settings as Settings)
  const chained = install?.kind === 'ok' ? install.chained : undefined
  if (plan.kind === 'unsupported') {
    io.err(`${t('cli.agent.unsupported')}\n`)
    return EXIT_FAILED
  }
  if (!plan.changed) {
    io.out(`${t(action === 'install' ? 'cli.agent.alreadyInstalled' : 'cli.agent.notInstalled')}\n`)
    return EXIT_OK
  }

  const show = (setting: { command: string } | undefined) => setting?.command ?? t('cli.agent.none')
  io.out(
    `${t(action === 'install' ? 'cli.agent.willInstall' : 'cli.agent.willRemove', { path: deps.settingsPath })}\n`,
  )
  io.out(`  ${t('cli.agent.before', { value: show(plan.before) })}\n`)
  io.out(`  ${t('cli.agent.after', { value: show(plan.after) })}\n`)
  if (chained) io.out(`${t('cli.agent.chained', { command: chained })}\n`)

  if (!args.includes('--yes') && !(await deps.confirm(t('cli.agent.confirm')))) {
    io.out(`${t('cli.agent.cancelled')}\n`)
    return EXIT_OK
  }
  if (text !== undefined)
    io.out(`${t('cli.agent.backup', { path: await deps.backup(deps.settingsPath) })}\n`)
  await deps.writeSettings(deps.settingsPath, `${JSON.stringify(plan.next, null, 2)}\n`)
  io.out(`${t('cli.agent.done')}\n`)
  return EXIT_OK
}

export async function runAgentCommand(
  args: readonly string[],
  io: Io,
  deps: AgentDeps,
): Promise<number> {
  const [subcommand, ...rest] = args
  if (subcommand === 'report') return report(rest, io, deps)
  if (subcommand === 'install' || subcommand === 'uninstall')
    return change(subcommand, rest, io, deps)
  io.err(`${deps.t('cli.agent.usage')}\n`)
  return EXIT_USAGE
}
