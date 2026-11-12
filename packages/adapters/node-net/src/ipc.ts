import { mkdirSync, rmSync } from 'node:fs'
import { connect, createServer, type Socket } from 'node:net'
import { dirname } from 'node:path'
import {
  type ErrorBody,
  errorBody,
  fail,
  type Logger,
  ok,
  type Result,
  type Transport,
} from '@dck/core'
import { transportFromSocket } from './transport.ts'

export interface Listener {
  close(): Promise<void>
}

function probe(endpoint: string): Promise<'alive' | 'stale' | 'absent'> {
  return new Promise((resolve) => {
    const socket = connect(endpoint)
    socket.once('connect', () => {
      socket.destroy()
      resolve('alive')
    })
    socket.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.code === 'ENOENT' ? 'absent' : 'stale')
    })
  })
}

export function connectTo(endpoint: string, logger: Logger): Promise<Result<Transport, ErrorBody>> {
  return new Promise((resolve) => {
    const socket = connect(endpoint)
    socket.once('connect', () => resolve(ok(transportFromSocket(socket, logger))))
    socket.once('error', (error: NodeJS.ErrnoException) =>
      resolve(fail(errorBody('DCK-DMN-002', `${endpoint} (${error.code ?? 'error'})`))),
    )
  })
}

export async function listenOn(
  endpoint: string,
  onConnection: (transport: Transport) => void,
  logger: Logger,
): Promise<Result<Listener, ErrorBody>> {
  const state = await probe(endpoint)
  if (state === 'alive') return fail(errorBody('DCK-DMN-001', endpoint))
  if (state === 'stale') rmSync(endpoint, { force: true })
  if (!endpoint.startsWith('\\\\')) mkdirSync(dirname(endpoint), { recursive: true, mode: 0o700 })

  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', (error) => logger.warn('ipc socket error', { error: String(error) }))
    onConnection(transportFromSocket(socket, logger))
  })

  return new Promise((resolve) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      resolve(fail(errorBody('DCK-DMN-002', `${endpoint} (${error.code ?? 'error'})`))),
    )
    server.listen(endpoint, () =>
      resolve(
        ok({
          close: () =>
            new Promise<void>((done) => {
              for (const socket of sockets) socket.destroy()
              server.close(() => done())
            }),
        }),
      ),
    )
  })
}
