import {
  type CommandParts,
  forwardedCommand,
  isOurCommand,
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
  // Runs the statusLine the user already had, with the same input, and returns what it printed
  forward(command: string, input: string): Promise<string>
  readonly settingsPath: string
  // User's home folder, to abbreviate paths like ~/.claude
  readonly home?: string
  // Log of failures that must not appear on Claude's screen
  log(line: string): void
  readSettings(path: string): Promise<string | undefined>
  writeSettings(path: string, text: string): Promise<void>
  // Copies the file before changing it and says where the copy went
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

// Always exits with 0: Claude Code calls this on every response and must not be bothered
async function report(args: readonly string[], io: Io, deps: AgentDeps): Promise<number> {
  const input = await deps.readStdin()
  const forward = flag(args, '--forward')
  if (forward) io.out(await deps.forward(forward, input))

  const agent = flag(args, '--agent')
  const ptyId = Number(deps.env.DCK_PTY_ID)
  // Outside a cockpit terminal there is no tab to attach the data to
  if (!agent || !Number.isInteger(ptyId)) return EXIT_OK

  const payload = parseJson(input)
  if (payload === undefined) {
    io.err(`${deps.t('cli.agent.reportInvalid')}\n`)
    return EXIT_OK
  }
  const connected = await io.connect(io.endpoint)
  // Without a daemon the cockpit is closed: that is the normal case, not an error
  if (!connected.ok) return EXIT_OK
  const client = createClient(connected.value)
  try {
    const reply = await client.request('agent.report', { agent, ptyId, payload })
    if (!reply.ok) {
      // Goes to a file and not the screen: Claude Code shows what the command prints
      deps.log(
        JSON.stringify({
          time: new Date().toISOString(),
          level: 'warn',
          message: 'agent report rejected by the daemon',
          code: reply.error.data?.code ?? reply.error.code,
          agent,
          ptyId,
        }),
      )
    }
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

  const tilde = (path: string) =>
    deps.home && path.startsWith(deps.home) ? `~${path.slice(deps.home.length)}` : path
  const describe = (setting: { command: string } | undefined) => {
    if (!setting) return t('cli.agent.none')
    if (!isOurCommand(setting.command)) return setting.command
    const forwarded = forwardedCommand(setting.command)
    return forwarded ? t('cli.agent.ours.chained', { command: forwarded }) : t('cli.agent.ours')
  }
  const rows: Array<[string, string]> = [
    [t('cli.agent.file'), tilde(deps.settingsPath)],
    [t('cli.agent.before'), describe(plan.before)],
    [t('cli.agent.after'), describe(plan.after)],
  ]
  const width = Math.max(...rows.map(([label]) => label.length))
  io.out(`\n${t('cli.agent.title')}\n\n`)
  for (const [label, value] of rows) io.out(`  ${label.padEnd(width)}  ${value}\n`)
  if (action === 'install') io.out(`\n${t('cli.agent.purpose')}\n`)
  if (chained) io.out(`${t('cli.agent.chainedNote')}\n`)
  const ask = !args.includes('--yes')
  if (ask && !(await deps.confirm(`\n${t('cli.agent.confirm')}`))) {
    io.out(`\n${t('cli.agent.cancelled')}\n`)
    return EXIT_OK
  }
  const copy = text !== undefined ? await deps.backup(deps.settingsPath) : undefined
  await deps.writeSettings(deps.settingsPath, `${JSON.stringify(plan.next, null, 2)}\n`)
  io.out(
    `${ask ? '\n' : ''}\u2713 ${t(action === 'install' ? 'cli.agent.installed' : 'cli.agent.removed')}\n`,
  )
  if (copy) io.out(`  ${t('cli.agent.backup', { path: tilde(copy) })}\n`)
  if (action === 'install') {
    io.out(`  ${t('cli.agent.nextInstall')}\n  ${t('cli.agent.undo')}\n`)
  }
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
