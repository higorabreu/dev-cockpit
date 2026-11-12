import {
  createClient,
  createTranslator,
  type ErrorBody,
  errorCodeOf,
  type Result,
  type Translate,
  type Transport,
} from '@dck/core'
import { signalAgent } from './agent-signal.ts'
import { type ExtDeps, runExtCommand } from './ext-commands.ts'

export interface CliDeps {
  readonly endpoint: string
  connect(endpoint: string): Promise<Result<Transport, ErrorBody>>
  out(text: string): void
  err(text: string): void
  readonly t?: Translate
  // Where `agent signal` finds DCK_PTY_ID
  readonly env?: Readonly<Record<string, string | undefined>>
  // Present when the `ext` command is available
  readonly ext?: ExtDeps
}

// Exit codes from sysexits.h, the BSD convention for command-line tools
export const EXIT = { ok: 0, failed: 1, usage: 64, unavailable: 69, software: 70 } as const

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

// A command line only shows up when the command is available
const usage = (text: string, unavailable: readonly string[]) =>
  text
    .split('\n')
    .filter((line) => !unavailable.some((command) => line.startsWith(`  ${command} `)))
    .join('\n')

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const t = deps.t ?? createTranslator('pt-BR').t
  const [command, ...rest] = argv
  if (command === 'agent' && rest[0] === 'signal') {
    await signalAgent(rest.slice(1), { ...deps, env: deps.env ?? {} })
    return EXIT.ok
  }
  if (command === 'agent') {
    deps.err(`${t('cli.agent.usage')}\n`)
    return EXIT.usage
  }
  if (command === 'ext' && deps.ext) {
    return runExtCommand(rest, { out: deps.out, err: deps.err, t }, deps.ext)
  }
  if (command !== 'toggle' && command !== 'ping') {
    const unavailable = deps.ext ? [] : ['ext']
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
