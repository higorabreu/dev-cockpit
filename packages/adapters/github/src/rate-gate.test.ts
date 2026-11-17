import type { HttpResponse } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createRateGate } from './rate-gate.ts'

const NOW = 1_800_000_000_000

const response = (
  status: number,
  headers: Record<string, string> = {},
  body = '{}',
): HttpResponse => ({ status, headers, body })

const setup = () => {
  let now = NOW
  const gate = createRateGate({ now: () => now })
  return { gate, advance: (ms: number) => (now += ms) }
}

describe('createRateGate', () => {
  it('should let every resource through when nothing was recorded', () => {
    const { gate } = setup()

    expect(gate.waitFor('core')).toBe(0)
    expect(gate.remaining('search')).toBeUndefined()
  })

  it('should keep the requests left when a response says how many', () => {
    const { gate } = setup()

    const refused = gate.record('core', response(200, { 'x-ratelimit-remaining': '4321' }))

    expect(refused).toBe(false)
    expect(gate.remaining('core')).toBe(4321)
  })

  it('should block the resource until the reset when a 403 has no requests left', () => {
    const { gate } = setup()
    const reset = String(NOW / 1000 + 600)

    const refused = gate.record(
      'core',
      response(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }),
    )

    expect(refused).toBe(true)
    expect(gate.waitFor('core')).toBe(600_000)
    expect(gate.waitFor('search')).toBe(0)
  })

  it('should wait what retry-after says when a secondary limit answers 429', () => {
    const { gate, advance } = setup()

    gate.record('search', response(429, { 'retry-after': '30' }))
    advance(10_000)

    expect(gate.waitFor('search')).toBe(20_000)
  })

  it('should back off a minute when a 403 names the limit in its body and has no headers', () => {
    const { gate } = setup()

    const refused = gate.record(
      'core',
      response(403, {}, '{"message":"You have exceeded a secondary rate limit."}'),
    )

    expect(refused).toBe(true)
    expect(gate.waitFor('core')).toBe(60_000)
  })

  it('should read a 403 without any sign of a limit as a refusal of permission', () => {
    const { gate } = setup()

    const refused = gate.record('core', response(403, {}, '{"message":"Resource not accessible"}'))

    expect(refused).toBe(false)
    expect(gate.waitFor('core')).toBe(0)
  })

  it('should block the next call when a success used the last request', () => {
    const { gate } = setup()

    gate.record(
      'search',
      response(200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 45) }),
    )

    expect(gate.waitFor('search')).toBe(45_000)
  })

  it('should never wait more than an hour when the reset is far away', () => {
    const { gate } = setup()

    gate.record('core', response(429, { 'x-ratelimit-reset': String(NOW / 1000 + 86_400) }))

    expect(gate.waitFor('core')).toBe(3_600_000)
  })

  it('should open again when the wait is over', () => {
    const { gate, advance } = setup()
    gate.record('core', response(429, { 'retry-after': '5' }))

    advance(5_000)

    expect(gate.waitFor('core')).toBe(0)
  })
})
