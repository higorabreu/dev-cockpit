import {
  type Cancel,
  createClient,
  DAEMON_PROTOCOL,
  type ErrorBody,
  type Logger,
  type Result,
  type Scheduler,
  type Transport,
} from '@dck/core'
import { z } from 'zod'

export interface DaemonLinkOptions {
  connect(): Promise<Result<Transport, ErrorBody>>
  readonly scheduler: Scheduler
  readonly logger: Logger
  onToggle(): void
  // Dados que um agente empurrou pelo daemon (por exemplo o statusLine do Claude)
  onAgentReport?(message: unknown): void
  // Chamado quando o daemon encontrado é mais antigo que esta versão do shell; quem chama
  // o encerra (por `shutdown`, ou à força se ele nem conhece o método) e sobe um novo
  replaceDaemon?(shutdown: () => Promise<boolean>): Promise<void>
  // Chamado na primeira falha de conexão, para quem quiser subir o daemon
  onUnavailable?(): void
  readonly retryMs?: number
}

const windowEvent = z.object({ action: z.literal('toggle') })

// Mantém a janela ligada ao daemon: assina o tópico "window" e reconecta quando a conexão cai
const MAX_REPLACEMENTS = 2

export function startDaemonLink(options: DaemonLinkOptions): { stop(): void } {
  const { connect, scheduler, logger, onToggle } = options
  const retryMs = options.retryMs ?? 2000
  let stopped = false
  let reportedUnavailable = false
  let replacements = 0
  let cancelRetry: Cancel | undefined
  let closeCurrent: (() => void) | undefined

  const retry = () => {
    if (!stopped) cancelRetry = scheduler.after(retryMs, attempt)
  }

  async function attempt() {
    const connected = await connect()
    if (stopped) {
      if (connected.ok) connected.value.close()
      return
    }
    if (!connected.ok) {
      logger.warn('daemon unavailable, retrying', { reason: connected.error.message })
      if (!reportedUnavailable) {
        reportedUnavailable = true
        options.onUnavailable?.()
      }
      retry()
      return
    }
    const transport = connected.value
    const client = createClient(transport)
    closeCurrent = () => client.close()
    transport.onClose(() => {
      logger.warn('daemon connection lost')
      retry()
    })
    const info = await client.request('info')
    const protocol = info.ok ? (info.value as { protocol?: number } | null)?.protocol : undefined
    if (protocol !== DAEMON_PROTOCOL && options.replaceDaemon && replacements < MAX_REPLACEMENTS) {
      replacements += 1
      logger.warn('daemon outdated, replacing it', { found: protocol ?? 'unknown' })
      await options.replaceDaemon(async () => (await client.request('shutdown')).ok)
      // Fechar dispara a reconexão, que já encontra o daemon novo
      client.close()
      return
    }
    // Um erro num tratador não pode subir até o processo principal: registra e segue
    const guard = (name: string, handler: () => void) => {
      try {
        handler()
      } catch (error) {
        logger.error('daemon event handler failed', { event: name, error: String(error) })
      }
    }
    const subscribed = await client.subscribe('window', (data) => {
      if (windowEvent.safeParse(data).success) guard('window', onToggle)
    })
    if (subscribed.ok) logger.info('daemon connected')
    await client.subscribe('agent', (data) => guard('agent', () => options.onAgentReport?.(data)))
  }

  void attempt()

  return {
    stop() {
      stopped = true
      cancelRetry?.()
      closeCurrent?.()
    },
  }
}
