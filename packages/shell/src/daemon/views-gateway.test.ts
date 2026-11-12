import { errorBody, fail, ok, silentLogger } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createViewsGateway } from './views-gateway.ts'

const snapshot = {
  view: 'review',
  items: [],
  updatedAt: 5,
  state: 'error',
  error: 'DCK-GLB-004',
}

function setup(reply: unknown) {
  const calls: { method: string; params: unknown }[] = []
  const gateway = createViewsGateway({
    logger: silentLogger,
    request: async (method, params) => {
      calls.push({ method, params })
      return reply === 'down' ? fail(errorBody('DCK-DMN-002')) : ok(reply)
    },
  })
  return { gateway, calls }
}

describe('createViewsGateway', () => {
  it('should return the parsed snapshot with a typed error code when the daemon answers', async () => {
    const { gateway, calls } = setup(snapshot)

    const result = await gateway.snapshot('review')

    expect(result).toMatchObject({
      view: 'review',
      state: 'error',
      error: 'DCK-GLB-004',
      updatedAt: 5,
    })
    expect(calls).toEqual([{ method: 'views.snapshot', params: { view: 'review' } }])
  })

  it('should pass the age limit to the daemon when refreshing with one', async () => {
    const { gateway, calls } = setup(snapshot)

    await gateway.refresh('mine', 60_000)

    expect(calls[0]).toEqual({
      method: 'views.refresh',
      params: { view: 'mine', maxAgeMs: 60_000 },
    })
  })

  it('should return nothing when the daemon is not reachable', async () => {
    const { gateway } = setup('down')

    expect(await gateway.snapshot('review')).toBeUndefined()
  })

  it('should return nothing when the daemon sends a snapshot of the wrong shape', async () => {
    const { gateway } = setup({ view: 'other' })

    expect(await gateway.snapshot('review')).toBeUndefined()
    expect(gateway.parse('garbage')).toBeUndefined()
  })

  it('should send the address to the daemon when configuring', async () => {
    const { gateway, calls } = setup({})

    await gateway.configure('https://gl.test')
    await gateway.configure(null)

    expect(calls.map((call) => call.params)).toEqual([{ url: 'https://gl.test' }, { url: null }])
  })
})
