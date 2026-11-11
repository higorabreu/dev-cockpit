import {
  createHub,
  type ErrorBody,
  errorBody,
  fail,
  ok,
  type Result,
  silentLogger,
  type Transport,
} from '@dck/core'
import { connectLoopback, FakeScheduler } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { startDaemonLink } from './daemon-link.ts'

const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

type Attempt = () => Result<Transport, ErrorBody>

function start(attempts: Attempt[]) {
  const scheduler = new FakeScheduler()
  const toggles: number[] = []
  const reports: unknown[] = []
  const queue = [...attempts]
  let calls = 0
  const link = startDaemonLink({
    connect: async () => {
      calls += 1
      const next = queue.shift()
      if (!next) throw new Error('unexpected connection attempt')
      return next()
    },
    scheduler,
    logger: silentLogger,
    onToggle: () => toggles.push(1),
    onAgentReport: (message) => reports.push(message),
    retryMs: 2000,
  })
  return { scheduler, toggles, reports, link, calls: () => calls }
}

describe('startDaemonLink', () => {
  it('should toggle the window when the daemon publishes a toggle event', async () => {
    const hub = createHub({}, silentLogger)
    const { toggles, link } = start([() => ok(connectLoopback(hub))])
    await tick()

    hub.publish('window', { action: 'toggle' })
    await tick()

    expect(toggles).toHaveLength(1)
    link.stop()
  })

  it('should ignore the event when the daemon publishes something that is not a toggle', async () => {
    const hub = createHub({}, silentLogger)
    const { toggles, link } = start([() => ok(connectLoopback(hub))])
    await tick()

    hub.publish('window', { action: 'explode' })
    await tick()

    expect(toggles).toHaveLength(0)
    link.stop()
  })

  it('should retry after the delay when the daemon is unavailable at first', async () => {
    const hub = createHub({}, silentLogger)
    const { scheduler, toggles, link, calls } = start([
      () => fail(errorBody('DCK-DMN-002')),
      () => ok(connectLoopback(hub)),
    ])
    await tick()

    scheduler.advance(2000)
    await tick()
    hub.publish('window', { action: 'toggle' })
    await tick()

    expect(calls()).toBe(2)
    expect(toggles).toHaveLength(1)
    link.stop()
  })

  it('should reconnect when the connection to the daemon drops', async () => {
    const hub = createHub({}, silentLogger)
    const first = connectLoopback(hub)
    const { scheduler, toggles, link, calls } = start([
      () => ok(first),
      () => ok(connectLoopback(hub)),
    ])
    await tick()

    first.close()
    scheduler.advance(2000)
    await tick()
    hub.publish('window', { action: 'toggle' })
    await tick()

    expect(calls()).toBe(2)
    expect(toggles).toHaveLength(1)
    link.stop()
  })

  it('should not try again when the link was stopped before the retry', async () => {
    const { scheduler, link, calls } = start([() => fail(errorBody('DCK-DMN-002'))])
    await tick()

    link.stop()
    scheduler.advance(10000)
    await tick()

    expect(calls()).toBe(1)
  })

  it('should report the daemon as unavailable only once when several attempts fail', async () => {
    const hub = createHub({}, silentLogger)
    const scheduler = new FakeScheduler()
    let reports = 0
    const link = startDaemonLink({
      connect: async () => fail(errorBody('DCK-DMN-002')),
      scheduler,
      logger: silentLogger,
      onToggle: () => {},
      onUnavailable: () => {
        reports += 1
      },
      retryMs: 2000,
    })
    await tick()
    scheduler.advance(2000)
    await tick()
    scheduler.advance(2000)
    await tick()

    expect(reports).toBe(1)
    expect(hub).toBeDefined()
    link.stop()
  })

  it('should pass an agent report to the handler when the daemon publishes one', async () => {
    const hub = createHub({}, silentLogger)
    const { reports, link } = start([() => ok(connectLoopback(hub))])
    await tick()

    hub.publish('agent', { agent: 'claude', ptyId: 1, payload: { a: 1 } })
    await tick()

    expect(reports).toEqual([{ agent: 'claude', ptyId: 1, payload: { a: 1 } }])
    link.stop()
  })
})
