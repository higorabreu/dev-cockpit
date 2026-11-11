import { describe, expect, it } from 'vitest'
import { silentLogger } from '../ports/logger.ts'
import { connectLoopback } from '../testing/loopback.ts'
import { createClient } from './client.ts'
import { createHub } from './hub.ts'

describe('createClient', () => {
  it('should fail pending requests with a closed connection error when the transport closes', async () => {
    const hub = createHub({ preso: () => new Promise(() => {}) }, silentLogger)
    const client = createClient(connectLoopback(hub))

    const pending = client.request('preso')
    client.close()
    const result = await pending

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.data?.code).toBe('DCK-IPC-005')
  })
})
