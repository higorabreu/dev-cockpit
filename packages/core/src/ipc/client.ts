import type { Unsubscribe } from '../ports/pty.ts'
import { fail, ok, type Result } from '../result.ts'
import { type ErrorBody, errorBody, isEvent, isResponse, type Message } from './protocol.ts'

export interface Transport {
  send(message: Message): void
  onMessage(listener: (message: Message) => void): Unsubscribe
  onClose(listener: () => void): Unsubscribe
  close(): void
}

export interface Client {
  request(method: string, params?: unknown): Promise<Result<unknown, ErrorBody>>
  subscribe(topic: string, listener: (data: unknown) => void): Promise<Result<unknown, ErrorBody>>
  close(): void
}

export function createClient(transport: Transport): Client {
  let nextId = 1
  const pending = new Map<number, (result: Result<unknown, ErrorBody>) => void>()
  const topics = new Map<string, Set<(data: unknown) => void>>()

  transport.onMessage((message) => {
    if (isResponse(message)) {
      const settle = pending.get(message.id)
      pending.delete(message.id)
      if (settle) settle('error' in message ? fail(message.error) : ok(message.result))
    } else if (isEvent(message)) {
      for (const listener of topics.get(message.event) ?? []) listener(message.data)
    }
  })

  transport.onClose(() => {
    for (const settle of pending.values()) settle(fail(errorBody('DCK-IPC-005')))
    pending.clear()
  })

  function request(method: string, params?: unknown) {
    return new Promise<Result<unknown, ErrorBody>>((resolve) => {
      const id = nextId++
      pending.set(id, resolve)
      transport.send({ id, method, params })
    })
  }

  return {
    request,
    async subscribe(topic, listener) {
      const listeners = topics.get(topic) ?? new Set<(data: unknown) => void>()
      listeners.add(listener)
      topics.set(topic, listeners)
      return request('subscribe', { topic })
    },
    close: () => transport.close(),
  }
}
