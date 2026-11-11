import { z } from 'zod'
import { DckError } from '../errors.ts'
import type { Logger } from '../ports/logger.ts'
import { errorBody, isRequest, type Message, type Request } from './protocol.ts'

const jsonrpc = '2.0' as const

export interface Peer {
  send(message: Message): void
}

export type Handler = (params: unknown, peer: Peer) => unknown | Promise<unknown>

export interface HubConnection {
  receive(message: Message): Promise<void>
  disconnect(): void
}

export interface Hub {
  connect(peer: Peer): HubConnection
  publish(topic: string, data?: unknown): number
}

const topicParams = z.object({ topic: z.string().min(1) })

export function createHub(handlers: Readonly<Record<string, Handler>>, logger: Logger): Hub {
  const subscribers = new Map<string, Set<Peer>>()

  const subscribe = (params: unknown, peer: Peer) => {
    const { topic } = topicParams.parse(params)
    const peers = subscribers.get(topic) ?? new Set<Peer>()
    peers.add(peer)
    subscribers.set(topic, peers)
    return { topic }
  }

  const unsubscribe = (params: unknown, peer: Peer) => {
    const { topic } = topicParams.parse(params)
    subscribers.get(topic)?.delete(peer)
    return { topic }
  }

  const methods: Readonly<Record<string, Handler>> = { ...handlers, subscribe, unsubscribe }

  async function respond(request: Request, peer: Peer) {
    const handler = methods[request.method]
    if (!handler) {
      peer.send({ jsonrpc, id: request.id, error: errorBody('DCK-IPC-001', request.method) })
      return
    }
    try {
      peer.send({ jsonrpc, id: request.id, result: (await handler(request.params, peer)) ?? null })
    } catch (error) {
      if (error instanceof z.ZodError) {
        peer.send({ jsonrpc, id: request.id, error: errorBody('DCK-IPC-003') })
      } else if (error instanceof DckError) {
        peer.send({ jsonrpc, id: request.id, error: errorBody(error.code, error.detail) })
      } else {
        logger.error('ipc handler failed', { method: request.method, error: String(error) })
        peer.send({ jsonrpc, id: request.id, error: errorBody('DCK-IPC-002') })
      }
    }
  }

  return {
    connect(peer) {
      return {
        async receive(message) {
          if (isRequest(message)) await respond(message, peer)
        },
        disconnect() {
          for (const peers of subscribers.values()) peers.delete(peer)
        },
      }
    },
    publish(topic, data) {
      const peers = subscribers.get(topic) ?? new Set<Peer>()
      for (const peer of peers) peer.send({ jsonrpc, method: topic, params: data })
      return peers.size
    },
  }
}
