import type { Socket } from 'node:net'
import { encode, LineDecoder, type Logger, type Message, type Transport } from '@dck/core'

export function transportFromSocket(socket: Socket, logger: Logger): Transport {
  const decoder = new LineDecoder()
  socket.setEncoding('utf8')
  return {
    send: (message: Message) => {
      if (!socket.destroyed) socket.write(encode(message))
    },
    onMessage(listener) {
      const handle = (chunk: string) => {
        for (const result of decoder.push(chunk)) {
          if (result.ok) listener(result.value)
          else logger.warn('ipc message ignored', { reason: result.error.message })
        }
      }
      socket.on('data', handle)
      return () => socket.off('data', handle)
    },
    onClose(listener) {
      socket.on('close', listener)
      return () => socket.off('close', listener)
    },
    close: () => socket.destroy(),
  }
}
