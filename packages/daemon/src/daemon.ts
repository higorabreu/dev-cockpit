import { listenOn } from '@dck/adapter-node-net'
import {
  agentSignalSchema,
  createHub,
  DAEMON_PROTOCOL,
  DckError,
  type ErrorBody,
  type Hub,
  type Logger,
  ok,
  type Result,
  VIEW_ID_MAX,
  type ViewsService,
} from '@dck/core'
import { z } from 'zod'

const viewParams = z.object({
  view: z.string().min(1).max(VIEW_ID_MAX),
  // With a max age, only fetches from the server if what is stored is older
  maxAgeMs: z.number().int().nonnegative().optional(),
})

// The account of one connector; null when it is not connected or its extension is disabled
const configureParams = z.object({
  connector: z.string().min(1).max(32),
  account: z
    .object({ url: z.string().min(1).max(512), email: z.string().min(1).max(254).optional() })
    .nullable(),
})

export interface DaemonOptions {
  readonly endpoint: string
  readonly logger: Logger
  // One views service per connector this daemon has code for, by connector id
  readonly views: ReadonlyMap<string, ViewsService>
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
  const connectorOf = (id: string) => {
    const found = views.get(id)
    if (!found) throw new DckError('DCK-IPC-003', `unknown connector ${id}`)
    return found
  }
  const serviceOf = (view: string) => {
    const found = [...views.values()].find((service) => service.views.includes(view))
    if (!found) throw new DckError('DCK-IPC-003', `unknown view ${view}`)
    return found
  }
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
      // A coding agent tells what it is doing in a tab; the daemon only relays it to the window
      'agent.signal': (params) => ({
        delivered: hub.publish('agent', agentSignalSchema.parse(params)),
      }),
      'views.configure': async (params) => {
        const { connector, account } = configureParams.parse(params)
        await connectorOf(connector).configure(account ?? undefined)
        return {}
      },
      'views.snapshot': (params) => {
        const { view } = viewParams.parse(params)
        return serviceOf(view).snapshot(view)
      },
      'views.refresh': async (params) => {
        const { view, maxAgeMs } = viewParams.parse(params)
        const service = serviceOf(view)
        if (maxAgeMs === undefined) await service.refresh(view)
        else await service.refreshIfStale(view, maxAgeMs)
        return service.snapshot(view)
      },
    },
    logger,
  )

  const forwarding = [...views.values()].map((service) =>
    service.onChange((snapshot) => hub.publish('views', snapshot)),
  )
  const stopForwarding = () => {
    for (const stop of forwarding) stop()
  }

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
