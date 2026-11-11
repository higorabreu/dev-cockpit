import { createClient, type ErrorBody, type Result, type Transport } from '@dck/core'

export interface CliDeps {
  readonly endpoint: string
  connect(endpoint: string): Promise<Result<Transport, ErrorBody>>
  out(text: string): void
  err(text: string): void
}

const USAGE = `Uso: dck <comando>

Comandos:
  toggle   Mostra ou esconde a janela
  ping     Confere se o daemon está respondendo
  daemon   Roda o daemon em primeiro plano
`

// Códigos de saída do sysexits.h, a convenção BSD para ferramentas de linha de comando
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

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const [command] = argv
  if (command !== 'toggle' && command !== 'ping') {
    deps.err(USAGE)
    return command === undefined || command === '--help' ? EXIT.ok : EXIT.usage
  }

  const connected = await deps.connect(deps.endpoint)
  if (!connected.ok) {
    deps.err(`${connected.error.message}\nInicie o daemon com: dck daemon\n`)
    return exitCodeFor(connected.error)
  }

  const client = createClient(connected.value)
  try {
    const reply = await client.request(command === 'ping' ? 'ping' : 'window.toggle')
    if (!reply.ok) {
      deps.err(`${reply.error.message}\n`)
      return exitCodeFor(reply.error)
    }
    if (command === 'ping') {
      deps.out(`${String(reply.value)}\n`)
      return EXIT.ok
    }
    const delivered = (reply.value as { delivered?: number } | null)?.delivered ?? 0
    if (delivered === 0) {
      deps.err('Nenhuma janela está conectada ao daemon.\n')
      return EXIT.unavailable
    }
    return EXIT.ok
  } finally {
    client.close()
  }
}
