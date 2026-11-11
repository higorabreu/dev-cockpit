import { describe, expect, it } from 'vitest'
import { encode, errorBody, isNotification, isRequest, LineDecoder } from './protocol.ts'

describe('encode', () => {
  it('should end the message with a newline when encoding', () => {
    const line = encode({ jsonrpc: '2.0', id: 1, method: 'ping' })

    expect(line.endsWith('\n')).toBe(true)
    expect(JSON.parse(line)).toEqual({ jsonrpc: '2.0', id: 1, method: 'ping' })
  })
})

describe('LineDecoder', () => {
  it('should return the message when a full line arrives', () => {
    const decoder = new LineDecoder()

    const results = decoder.push(encode({ jsonrpc: '2.0', id: 1, method: 'ping' }))

    expect(results).toEqual([{ ok: true, value: { jsonrpc: '2.0', id: 1, method: 'ping' } }])
  })

  it('should wait for the rest of the line when a chunk ends in the middle of it', () => {
    const decoder = new LineDecoder()
    const line = encode({ jsonrpc: '2.0', id: 2, method: 'window.toggle' })

    const first = decoder.push(line.slice(0, 10))
    const second = decoder.push(line.slice(10))

    expect(first).toEqual([])
    expect(second).toEqual([
      { ok: true, value: { jsonrpc: '2.0', id: 2, method: 'window.toggle' } },
    ])
  })

  it('should return every message when several lines arrive in one chunk', () => {
    const decoder = new LineDecoder()
    const chunk =
      encode({ jsonrpc: '2.0', id: 1, method: 'a' }) +
      encode({ jsonrpc: '2.0', method: 'window', params: 1 })

    const results = decoder.push(chunk)

    expect(results.map((result) => result.ok)).toEqual([true, true])
  })

  it('should report an invalid message error when the line is not JSON', () => {
    const decoder = new LineDecoder()

    const [result] = decoder.push('isto nao e json\n')

    expect(result?.ok).toBe(false)
    if (result && !result.ok) expect(result.error.data?.code).toBe('DCK-IPC-004')
  })

  it('should report an invalid message error when the JSON has no known shape', () => {
    const decoder = new LineDecoder()

    const [result] = decoder.push('{"qualquer":"coisa"}\n')

    expect(result?.ok).toBe(false)
  })

  it('should ignore blank lines when decoding', () => {
    const decoder = new LineDecoder()

    const results = decoder.push('\n\n')

    expect(results).toEqual([])
  })
})

describe('message kinds', () => {
  it('should tell a notification from a request when the message has no id', () => {
    const decoder = new LineDecoder()

    const [notification, request] = decoder.push(
      `${encode({ jsonrpc: '2.0', method: 'window', params: 1 })}${encode({ jsonrpc: '2.0', id: 1, method: 'ping' })}`,
    )

    expect(notification?.ok && isNotification(notification.value)).toBe(true)
    expect(request?.ok && isRequest(request.value)).toBe(true)
  })

  it('should reject the message when it does not declare JSON-RPC 2.0', () => {
    const decoder = new LineDecoder()

    const [result] = decoder.push('{"id":1,"method":"ping"}\n')

    expect(result?.ok).toBe(false)
  })
})

describe('errorBody', () => {
  it('should use the JSON-RPC code and carry the DCK code and category when building an error', () => {
    const body = errorBody('DCK-IPC-001', 'x.y')

    expect(body.code).toBe(-32601)
    expect(body.message).toContain('x.y')
    expect(body.data).toEqual({ code: 'DCK-IPC-001', category: 'not_found', retryable: false })
  })
})
