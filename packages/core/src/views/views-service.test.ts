import { describe, expect, it } from 'vitest'
import { errorBody } from '../ipc/protocol.ts'
import { silentLogger } from '../ports/logger.ts'
import type {
  ViewCache,
  ViewCacheData,
  ViewItem,
  ViewSnapshot,
  ViewSource,
} from '../ports/views.ts'
import { fail, ok } from '../result.ts'
import { FakeClock } from '../testing/index.ts'
import { accountScope, createViewsService } from './views-service.ts'

const item = (number: number): ViewItem => ({
  kind: 'mergeRequest',
  id: `g/p!${number}`,
  number,
  title: `MR ${number}`,
  url: `https://gl.test/g/p/-/merge_requests/${number}`,
  project: 'g/p',
  author: 'ana',
  sourceBranch: 'feat/x',
  targetBranch: 'main',
  draft: false,
  updatedAt: '2026-11-11T10:00:00Z',
  hasConflicts: false,
  openDiscussions: false,
  pipeline: 'success',
})

class MemoryCache implements ViewCache {
  saved: ViewCacheData[] = []
  constructor(public data?: ViewCacheData) {}
  async load() {
    return this.data
  }
  async save(data: ViewCacheData) {
    this.data = data
    this.saved.push(data)
  }
}

function setup(options: { cache?: MemoryCache; source?: ViewSource | 'none' } = {}) {
  const clock = new FakeClock(1_000)
  const cache = options.cache ?? new MemoryCache()
  let calls = 0
  const defaultSource: ViewSource = {
    items: async () => {
      calls += 1
      return ok([item(1)])
    },
  }
  const source = options.source === 'none' ? undefined : (options.source ?? defaultSource)
  const service = createViewsService({
    views: ['review', 'mine'],
    source: async () => source,
    cache,
    clock,
    logger: silentLogger,
  })
  const changes: ViewSnapshot[] = []
  service.onChange((snapshot) => changes.push(snapshot))
  return { service, clock, cache, changes, calls: () => calls }
}

describe('snapshot', () => {
  it('should serve the cached items without calling the server when the account matches', async () => {
    const cache = new MemoryCache({
      scope: 'https://gl.test',
      views: { review: { items: [item(9)], updatedAt: 500 } },
    })
    const { service, calls } = setup({ cache })
    await service.configure({ url: 'https://gl.test' })

    const snapshot = await service.snapshot('review')

    expect(snapshot.items.map((entry) => entry.id)).toEqual(['g/p!9'])
    expect(snapshot.updatedAt).toBe(500)
    expect(calls()).toBe(0)
  })

  it('should ignore the cache when it belongs to another account', async () => {
    const cache = new MemoryCache({
      scope: 'https://outro.test',
      views: { review: { items: [item(9)], updatedAt: 500 } },
    })
    const { service } = setup({ cache })
    await service.configure({ url: 'https://gl.test' })

    const snapshot = await service.snapshot('review')

    expect(snapshot.items).toEqual([])
    expect(snapshot.updatedAt).toBeUndefined()
  })

  it('should be unconfigured when no account was configured', async () => {
    const { service } = setup()

    expect((await service.snapshot('mine')).state).toBe('unconfigured')
  })
})

describe('refresh', () => {
  it('should store the items, stamp the time and save the cache when the server answers', async () => {
    const { service, cache, clock } = setup()
    await service.configure({ url: 'https://gl.test' })
    clock.time = 2_000

    await service.refresh('review')

    const snapshot = await service.snapshot('review')
    expect(snapshot).toMatchObject({ state: 'idle', updatedAt: 2_000, error: undefined })
    expect(snapshot.items).toHaveLength(1)
    expect((cache as MemoryCache).saved.at(-1)?.views.review?.updatedAt).toBe(2_000)
  })

  it('should announce refreshing and then idle when refreshing', async () => {
    const { service, changes } = setup()
    await service.configure({ url: 'https://gl.test' })
    changes.length = 0

    await service.refresh('review')

    expect(changes.map((change) => change.state)).toEqual(['refreshing', 'idle'])
  })

  it('should keep the old items and report the error code when the server fails', async () => {
    const failing: ViewSource = {
      items: async () => fail(errorBody('DCK-GLB-004')),
    }
    const cache = new MemoryCache({
      scope: 'https://gl.test',
      views: { review: { items: [item(9)], updatedAt: 500 } },
    })
    const { service } = setup({ cache, source: failing })
    await service.configure({ url: 'https://gl.test' })

    await service.refresh('review')

    const snapshot = await service.snapshot('review')
    expect(snapshot).toMatchObject({ state: 'error', error: 'DCK-GLB-004', updatedAt: 500 })
    expect(snapshot.items).toHaveLength(1)
  })

  it('should share one server call when the same view is refreshed twice at once', async () => {
    const { service, calls } = setup()
    await service.configure({ url: 'https://gl.test' })

    await Promise.all([service.refresh('review'), service.refresh('review')])

    expect(calls()).toBe(1)
  })

  it('should become unconfigured and drop the items when there is no source', async () => {
    const { service } = setup({ source: 'none' })
    await service.configure({ url: 'https://gl.test' })

    await service.refresh('review')

    expect(await service.snapshot('review')).toMatchObject({ state: 'unconfigured', items: [] })
  })

  it('should discard the result when the account changes during the refresh', async () => {
    let finish: (() => void) | undefined
    const slow: ViewSource = {
      items: () =>
        new Promise((resolve) => {
          finish = () => resolve(ok([item(1)]))
        }),
    }
    const { service } = setup({ source: slow })
    await service.configure({ url: 'https://a.test' })
    const pending = service.refresh('review')
    await Promise.resolve()
    await Promise.resolve()

    await service.configure({ url: 'https://b.test' })
    finish?.()
    await pending

    expect((await service.snapshot('review')).items).toEqual([])
  })
})

describe('refreshIfStale', () => {
  it('should skip the server when the data is younger than the limit', async () => {
    const { service, calls, clock } = setup()
    await service.configure({ url: 'https://gl.test' })
    await service.refresh('review')
    clock.time += 10_000

    await service.refreshIfStale('review', 60_000)

    expect(calls()).toBe(1)
  })

  it('should refresh when the data is older than the limit', async () => {
    const { service, calls, clock } = setup()
    await service.configure({ url: 'https://gl.test' })
    await service.refresh('review')
    clock.time += 61_000

    await service.refreshIfStale('review', 60_000)

    expect(calls()).toBe(2)
  })

  it('should refresh when nothing was fetched yet', async () => {
    const { service, calls } = setup()
    await service.configure({ url: 'https://gl.test' })

    await service.refreshIfStale('mine', 60_000)

    expect(calls()).toBe(1)
  })
})

describe('accountScope', () => {
  it('should be the address alone when the account has no e-mail', () => {
    expect(accountScope({ url: 'https://gl.test' })).toBe('https://gl.test')
  })

  it('should tell two people on the same site apart when the account has an e-mail', () => {
    const ana = accountScope({ url: 'https://acme.example.com', email: 'ana@example.com' })
    const bruno = accountScope({ url: 'https://acme.example.com', email: 'bruno@example.com' })

    expect(ana).not.toBe(bruno)
  })
})

describe('configure', () => {
  it('should drop what was stored when the account changes to another e-mail on the same site', async () => {
    const { service } = setup()
    await service.configure({ url: 'https://acme.example.com', email: 'ana@example.com' })
    await service.refresh('review')

    await service.configure({ url: 'https://acme.example.com', email: 'bruno@example.com' })

    expect((await service.snapshot('review')).items).toEqual([])
  })
})
