import { listenOn } from '@dck/adapter-node-net'
import { createHub, type ErrorBody, type Hub, type Logger, ok, type Result } from '@dck/core'

export interface DaemonOptions {
  readonly endpoint: string
  readonly logger: Logger
}

export interface RunningDaemon {
  readonly hub: Hub
  stop(): Promise<void>
}

export async function startDaemon(
  options: DaemonOptions,
): Promise<Result<RunningDaemon, ErrorBody>> {
  const { endpoint, logger } = options
  const hub: Hub = createHub(
    {
      ping: () => 'pong',
      'window.toggle': () => ({ delivered: hub.publish('window', { action: 'toggle' }) }),
    },
    logger,
  )

  const listening = await listenOn(
    endpoint,
    (transport) => {
      const connection = hub.connect({ send: transport.send })
      transport.onMessage((message) => void connection.receive(message))
      transport.onClose(() => connection.disconnect())
    },
    logger,
  )
  if (!listening.ok) return listening

  return ok({ hub, stop: () => listening.value.close() })
}
