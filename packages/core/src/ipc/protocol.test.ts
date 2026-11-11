import { describe, expect, it } from 'vitest'
import { encode, LineDecoder } from './protocol.ts'

describe('encode', () => {
  it('should end the message with a newline when encoding', () => {
    const line = encode({ id: 1, method: 'ping' })

    expect(line.endsWith('\n')).toBe(true)
    expect(JSON.parse(line)).toEqual({ id: 1, method: 'ping' })
  })
})

describe('LineDecoder', () => {
  it('should return the message when a full line arrives', () => {
    const decoder = new LineDecoder()

    const results = decoder.push(encode({ id: 1, method: 'ping' }))

    expect(results).toEqual([{ ok: true, value: { id: 1, method: 'ping' } }])
  })

  it('should wait for the rest of the line when a chunk ends in the middle of it', () => {
    const decoder = new LineDecoder()
    const line = encode({ id: 2, method: 'window.toggle' })

    const first = decoder.push(line.slice(0, 10))
    const second = decoder.push(line.slice(10))

    expect(first).toEqual([])
    expect(second).toEqual([{ ok: true, value: { id: 2, method: 'window.toggle' } }])
  })

  it('should return every message when several lines arrive in one chunk', () => {
    const decoder = new LineDecoder()
    const chunk = encode({ id: 1, method: 'a' }) + encode({ event: 'window', data: 1 })

    const results = decoder.push(chunk)

    expect(results.map((result) => result.ok)).toEqual([true, true])
  })

  it('should report an invalid message error when the line is not JSON', () => {
    const decoder = new LineDecoder()

    const [result] = decoder.push('isto nao e json\n')

    expect(result?.ok).toBe(false)
    if (result && !result.ok) expect(result.error.code).toBe('DCK-IPC-004')
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
