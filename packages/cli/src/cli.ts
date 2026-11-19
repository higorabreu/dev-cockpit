import {
  createTranslator,
  type ErrorBody,
  type Result,
  type Translate,
  type Transport,
} from '@dck/core'
import { signalAgent } from './agent-signal.ts'
import { isDaemonCommand, runDaemonCommand } from './daemon-command.ts'
import { EXIT } from './exit-codes.ts'
import { type ExtDeps, runExtCommand } from './ext-commands.ts'

export { EXIT, exitCodeFor } from './exit-codes.ts'

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

// A command line only shows up when the command is available
const usage = (text: string, unavailable: readonly string[]) =>
  text
    .split('\n')
    .filter((line) => !unavailable.some((command) => line.startsWith(`  ${command} `)))
    .join('\n')

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const t = deps.t ?? createTranslator('en').t
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
  if (!isDaemonCommand(command)) {
    const unavailable = deps.ext ? [] : ['ext']
    deps.err(usage(t('cli.usage'), unavailable))
    return command === undefined || command === '--help' ? EXIT.ok : EXIT.usage
  }
  return runDaemonCommand(command, { ...deps, translate: async () => t })
}
