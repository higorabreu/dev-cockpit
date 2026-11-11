import { listenOn } from '@dck/adapter-node-net'
import { createHub, type ErrorBody, type Hub, type Logger, ok, type Result } from '@dck/core'
import { z } from 'zod'

const MAX_REPORT_BYTES = 256 * 1024

const agentReport = z.object({
  agent: z.string().min(1).max(64),
  ptyId: z.number().int().nonnegative(),
  payload: z.unknown().refine((value) => JSON.stringify(value ?? null).length <= MAX_REPORT_BYTES),
})

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
      // O agente (por exemplo pelo statusLine) empurra dados de uma aba; o daemon só repassa
      'agent.report': (params) => ({ delivered: hub.publish('agent', agentReport.parse(params)) }),
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
