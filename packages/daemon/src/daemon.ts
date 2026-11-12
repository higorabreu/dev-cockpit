import { listenOn } from '@dck/adapter-node-net'
import {
  createHub,
  DAEMON_PROTOCOL,
  type ErrorBody,
  type Hub,
  type Logger,
  ok,
  type Result,
  type ViewsService,
} from '@dck/core'
import { z } from 'zod'

const viewParams = z.object({
  view: z.enum(['review', 'mine']),
  // With a max age, only fetches from the server if what is stored is older
  maxAgeMs: z.number().int().nonnegative().optional(),
})

const configureParams = z.object({ url: z.string().min(1).max(512).nullable() })

export interface DaemonOptions {
  readonly endpoint: string
  readonly logger: Logger
  readonly views: ViewsService
  // Called when a client asks the daemon to shut down, for example to replace it with a newer one
  onShutdown?(): void
}

export interface RunningDaemon {
  readonly hub: Hub
  stop(): Promise<void>
}

export async function startDaemon(
  options: DaemonOptions,
): Promise<Result<RunningDaemon, ErrorBody>> {
  const { endpoint, logger, views } = options
  const hub: Hub = createHub(
    {
      ping: () => 'pong',
      info: () => ({ protocol: DAEMON_PROTOCOL }),
      shutdown: () => {
        // Answers before shutting down, so the client receives the confirmation
        setTimeout(() => options.onShutdown?.(), 50)
        return { stopping: true }
      },
      'window.toggle': () => ({ delivered: hub.publish('window', { action: 'toggle' }) }),
      'views.configure': async (params) => {
        await views.configure(configureParams.parse(params).url ?? undefined)
        return {}
      },
      'views.snapshot': (params) => views.snapshot(viewParams.parse(params).view),
      'views.refresh': async (params) => {
        const { view, maxAgeMs } = viewParams.parse(params)
        if (maxAgeMs === undefined) await views.refresh(view)
        else await views.refreshIfStale(view, maxAgeMs)
        return views.snapshot(view)
      },
    },
    logger,
  )

  const stopForwarding = views.onChange((snapshot) => hub.publish('views', snapshot))

  const listening = await listenOn(
    endpoint,
    (transport) => {
      const connection = hub.connect({ send: transport.send })
      transport.onMessage((message) => void connection.receive(message))
      transport.onClose(() => connection.disconnect())
    },
    logger,
  )
  if (!listening.ok) {
    stopForwarding()
    return listening
  }

  return ok({
    hub,
    stop: () => {
      stopForwarding()
      return listening.value.close()
    },
  })
}
