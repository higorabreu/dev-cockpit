import {
  type Cancel,
  createClient,
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
  readonly retryMs?: number
}

const windowEvent = z.object({ action: z.literal('toggle') })

// Mantém a janela ligada ao daemon: assina o tópico "window" e reconecta quando a conexão cai
export function startDaemonLink(options: DaemonLinkOptions): { stop(): void } {
  const { connect, scheduler, logger, onToggle } = options
  const retryMs = options.retryMs ?? 2000
  let stopped = false
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
    const subscribed = await client.subscribe('window', (data) => {
      if (windowEvent.safeParse(data).success) onToggle()
    })
    if (subscribed.ok) logger.info('daemon connected')
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
