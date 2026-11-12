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

export interface CliDeps {
  readonly endpoint: string
  connect(endpoint: string): Promise<Result<Transport, ErrorBody>>
  out(text: string): void
  err(text: string): void
  readonly t?: Translate
  // Present when the `agent` command is available
  readonly agent?: AgentDeps
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

// The `agent` command line only shows up when it is available (in the package it stays dormant)
const usage = (text: string, withAgent: boolean) =>
  withAgent
    ? text
    : text
        .split('\n')
        .filter((line) => !line.startsWith('  agent '))
        .join('\n')

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const t = deps.t ?? createTranslator('pt-BR').t
  const [command, ...rest] = argv
  if (command === 'agent' && deps.agent) {
    return runAgentCommand(rest, deps, deps.agent)
  }
  if (command !== 'toggle' && command !== 'ping') {
    deps.err(usage(t('cli.usage'), deps.agent !== undefined))
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
