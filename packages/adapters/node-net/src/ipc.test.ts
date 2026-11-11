import { mkdtempSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, createHub, silentLogger } from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { connectTo, listenOn } from './ipc.ts'

const closers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

const endpoint = () => join(mkdtempSync(join(tmpdir(), 'dck-net-')), 'daemon.sock')

async function serve(path: string) {
  const hub = createHub({ ping: () => 'pong' }, silentLogger)
  const listening = await listenOn(
    path,
    (transport) => {
      const connection = hub.connect({ send: transport.send })
      transport.onMessage((message) => void connection.receive(message))
      transport.onClose(() => connection.disconnect())
    },
    silentLogger,
  )
  if (listening.ok) closers.push(() => listening.value.close())
  return listening
}

describe('node-net IPC', () => {
  it('should answer a request over a real socket when the daemon is listening', async () => {
    const path = endpoint()
    await serve(path)
    const connected = await connectTo(path, silentLogger)
    if (!connected.ok) throw new Error('connection failed')
    const client = createClient(connected.value)
    closers.push(async () => client.close())

    const result = await client.request('ping')

    expect(result).toEqual({ ok: true, value: 'pong' })
  })

  it('should refuse to listen when another daemon is already on the endpoint', async () => {
    const path = endpoint()
    await serve(path)

    const second = await serve(path)

    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.code).toBe('DCK-DMN-001')
  })

  it('should take over the endpoint when a stale file is left there', async () => {
    const path = endpoint()
    writeFileSync(path, '')

    const listening = await serve(path)

    expect(listening.ok).toBe(true)
  })

  it('should report a daemon connection error when nothing is listening', async () => {
    const result = await connectTo(endpoint(), silentLogger)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('DCK-DMN-002')
  })

  it('should keep working when a client sends a line that is not valid JSON', async () => {
    const path = endpoint()
    await serve(path)
    const raw = connect(path)
    closers.push(async () => {
      raw.destroy()
    })
    const replies: string[] = []
    raw.setEncoding('utf8')
    raw.on('data', (chunk: string) => replies.push(chunk))

    raw.write('isto nao e json\n')
    raw.write('{"id":1,"method":"ping"}\n')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(replies.join('')).toContain('"result":"pong"')
  })
})
