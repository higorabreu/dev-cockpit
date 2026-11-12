import type { Transport } from '../ipc/client.ts'
import type { Hub } from '../ipc/hub.ts'
import type { Message } from '../ipc/protocol.ts'

// Connects a client to an in-memory hub, with no socket, to test the protocol
export function connectLoopback(hub: Hub): Transport {
  const messageListeners = new Set<(message: Message) => void>()
  const closeListeners = new Set<() => void>()
  const connection = hub.connect({
    send: (message) => queueMicrotask(() => deliver(messageListeners, message)),
  })
  return {
    send: (message) => {
      void connection.receive(message)
    },
    onMessage(listener) {
      messageListeners.add(listener)
      return () => messageListeners.delete(listener)
    },
    onClose(listener) {
      closeListeners.add(listener)
      return () => closeListeners.delete(listener)
    },
    close() {
      connection.disconnect()
      for (const listener of closeListeners) listener()
    },
  }
}

function deliver(listeners: Set<(message: Message) => void>, message: Message) {
  for (const listener of listeners) listener(message)
}
