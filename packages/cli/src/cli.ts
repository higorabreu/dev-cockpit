import {
  createClient,
  createTranslator,
  type ErrorBody,
  errorCodeOf,
  type Result,
  type Translate,
  type Transport,
} from '@dck/core'
import { type AgentDeps, runAgentCommand } from './agent-commands.ts'
import { type ExtDeps, runExtCommand } from './ext-commands.ts'
import { EXIT } from './output.ts'
import {
  runStandardsCommand,
  STANDARDS_COMMANDS,
  type StandardsCommand,
  type StandardsDeps,
} from './standards-commands.ts'

export interface CliDeps {
  readonly endpoint: string
  connect(endpoint: string): Promise<Result<Transport, ErrorBody>>
  out(text: string): void
  err(text: string): void
  readonly t?: Translate
  // Present when the `agent` command is available
  readonly agent?: AgentDeps
  // Present when the `ext` command is available
  readonly ext?: ExtDeps
  // Present when the commands of the standards are available
  readonly standards?: StandardsDeps
}

export { EXIT } from './output.ts'

export function exitCodeFor(error: ErrorBody): number {
  switch (error.data?.category) {
    case 'invalid_argument':
      return EXIT.usage
    case 'unavailable':
      return EXIT.unavailable
    case 'internal':
      return EXIT.software
    default:
      return EXIT.failed
  }
}

// A command line only shows up when the command is available (in the package `agent` stays dormant)
const usage = (text: string, unavailable: readonly string[]) =>
  text
    .split('\n')
    .filter((line) => !unavailable.some((command) => line.startsWith(`  ${command} `)))
    .join('\n')

const isStandardsCommand = (command: string | undefined): command is StandardsCommand =>
  STANDARDS_COMMANDS.some((known) => known === command)

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const t = deps.t ?? createTranslator('pt-BR').t
  const [command, ...rest] = argv
  if (command === 'agent' && deps.agent) {
    return runAgentCommand(rest, deps, deps.agent)
  }
  if (command === 'ext' && deps.ext) {
    return runExtCommand(rest, { out: deps.out, err: deps.err, t }, deps.ext)
  }
  if (deps.standards && isStandardsCommand(command)) {
    return runStandardsCommand(command, rest, { out: deps.out, err: deps.err, t }, deps.standards)
  }
  if (command !== 'toggle' && command !== 'ping') {
    const unavailable = [
      ...(deps.agent ? [] : ['agent']),
      ...(deps.ext ? [] : ['ext']),
      ...(deps.standards ? [] : STANDARDS_COMMANDS),
    ]
    deps.err(usage(t('cli.usage'), unavailable))
    return command === undefined || command === '--help' ? EXIT.ok : EXIT.usage
  }

  const connected = await deps.connect(deps.endpoint)
  if (!connected.ok) {
    deps.err(`${t(`error.${errorCodeOf(connected.error)}`)}\n${t('cli.startDaemon')}\n`)
    return exitCodeFor(connected.error)
  }

  const client = createClient(connected.value)
  try {
    const reply = await client.request(command === 'ping' ? 'ping' : 'window.toggle')
    if (!reply.ok) {
      deps.err(`${t(`error.${errorCodeOf(reply.error)}`)}\n`)
      return exitCodeFor(reply.error)
    }
    if (command === 'ping') {
      deps.out(`${String(reply.value)}\n`)
      return EXIT.ok
    }
    const delivered = (reply.value as { delivered?: number } | null)?.delivered ?? 0
    if (delivered === 0) {
      deps.err(`${t('cli.noWindow')}\n`)
      return EXIT.unavailable
    }
    return EXIT.ok
  } finally {
    client.close()
  }
}
