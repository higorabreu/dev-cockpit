import {
  type AgentSignal,
  agentSignalSchema,
  type Cancel,
  type Client,
  createClient,
  DAEMON_PROTOCOL,
  type ErrorBody,
  errorBody,
  fail,
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
  // New state of a view, published by the daemon after a fetch
  onViews?(snapshot: unknown): void
  // Called on every ready daemon connection, for whoever needs to send the configuration
  onReady?(): void
  // What a coding agent in a cockpit terminal said it is doing
  onAgentSignal?(signal: AgentSignal): void
  // Called when the found daemon is older than this shell version; the caller
  // shuts it down (by `shutdown`, or by force if it does not know the method) and starts a new one
  replaceDaemon?(shutdown: () => Promise<boolean>): Promise<void>
  // Called on the first connection failure, for whoever wants to start the daemon
  onUnavailable?(): void
  readonly retryMs?: number
}

const windowEvent = z.object({ action: z.literal('toggle') })

// Keeps the window attached to the daemon: subscribes to the "window" topic and reconnects when the connection drops
const MAX_REPLACEMENTS = 2

export interface DaemonLink {
  stop(): void
  // Fails with DCK-DMN-002 while there is no connection
  request(method: string, params?: unknown): Promise<Result<unknown, ErrorBody>>
}

export function startDaemonLink(options: DaemonLinkOptions): DaemonLink {
  const { connect, scheduler, logger, onToggle } = options
  const retryMs = options.retryMs ?? 2000
  let stopped = false
  let reportedUnavailable = false
  let replacements = 0
  let cancelRetry: Cancel | undefined
  let closeCurrent: (() => void) | undefined
  let ready: Client | undefined

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
      ready = undefined
      logger.warn('daemon connection lost')
      retry()
    })
    const info = await client.request('info')
    const protocol = info.ok ? (info.value as { protocol?: number } | null)?.protocol : undefined
    if (protocol !== DAEMON_PROTOCOL && options.replaceDaemon && replacements < MAX_REPLACEMENTS) {
      replacements += 1
      logger.warn('daemon outdated, replacing it', { found: protocol ?? 'unknown' })
      await options.replaceDaemon(async () => (await client.request('shutdown')).ok)
      // Closing triggers the reconnection, which finds the new daemon
      client.close()
      return
    }
    // An error in a handler must not bubble up to the main process: it logs and moves on
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
    await client.subscribe('agent', (data) => {
      const signal = agentSignalSchema.safeParse(data)
      if (signal.success) guard('agent', () => options.onAgentSignal?.(signal.data))
      else logger.warn('invalid agent signal ignored')
    })
    await client.subscribe('views', (data) => guard('views', () => options.onViews?.(data)))
    ready = client
    guard('ready', () => options.onReady?.())
  }

  void attempt()

  return {
    request: async (method, params) =>
      ready ? ready.request(method, params) : fail(errorBody('DCK-DMN-002', 'no connection')),
    stop() {
      stopped = true
      cancelRetry?.()
      closeCurrent?.()
    },
  }
}
