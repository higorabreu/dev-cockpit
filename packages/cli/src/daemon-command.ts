import {
  createClient,
  type ErrorBody,
  errorCodeOf,
  type Result,
  type Translate,
  type Transport,
} from '@dck/core'
import { EXIT, exitCodeFor } from './exit-codes.ts'

// The commands that only ask the daemon something; the window's global key runs `toggle` (D30)
export type DaemonCommand = 'toggle' | 'ping'

export const isDaemonCommand = (command: string | undefined): command is DaemonCommand =>
  command === 'toggle' || command === 'ping'

export interface DaemonCommandDeps {
  readonly endpoint: string
  connect(endpoint: string): Promise<Result<Transport, ErrorBody>>
  out(text: string): void
  err(text: string): void
  // Asked for only when there is a failure to report, so a working toggle never loads the catalogs
  translate(): Promise<Translate>
}

export async function runDaemonCommand(
  command: DaemonCommand,
  deps: DaemonCommandDeps,
): Promise<number> {
  const connected = await deps.connect(deps.endpoint)
  if (!connected.ok) {
    const t = await deps.translate()
    deps.err(`${t(`error.${errorCodeOf(connected.error)}`)}\n${t('cli.startDaemon')}\n`)
    return exitCodeFor(connected.error)
  }

  const client = createClient(connected.value)
  try {
    const reply = await client.request(command === 'ping' ? 'ping' : 'window.toggle')
    if (!reply.ok) {
      const t = await deps.translate()
      deps.err(`${t(`error.${errorCodeOf(reply.error)}`)}\n`)
      return exitCodeFor(reply.error)
    }
    if (command === 'ping') {
      deps.out(`${String(reply.value)}\n`)
      return EXIT.ok
    }
    const delivered = (reply.value as { delivered?: number } | null)?.delivered ?? 0
    if (delivered === 0) {
      const t = await deps.translate()
      deps.err(`${t('cli.noWindow')}\n`)
      return EXIT.unavailable
    }
    return EXIT.ok
  } finally {
    client.close()
  }
}
