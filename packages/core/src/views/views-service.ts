import { errorCodeOf } from '../errors.ts'
import type { Clock } from '../ports/clock.ts'
import type { ConnectionFields } from '../ports/connections.ts'
import type { Logger } from '../ports/logger.ts'
import type { Unsubscribe } from '../ports/pty.ts'
import type { CachedView, ViewCache, ViewSnapshot, ViewSource } from '../ports/views.ts'

export interface ViewsServiceOptions {
  // The ids of the views of one connector
  readonly views: readonly string[]
  // Undefined when there is no token for the account
  source(account: ConnectionFields): Promise<ViewSource | undefined>
  readonly cache: ViewCache
  readonly clock: Clock
  readonly logger: Logger
}

export interface ViewsService {
  readonly views: readonly string[]
  // Returns what is stored right now, without waiting for the network
  snapshot(view: string): Promise<ViewSnapshot>
  // Fetches from the server; simultaneous calls for the same view share one fetch
  refresh(view: string): Promise<void>
  refreshIfStale(view: string, maxAgeMs: number): Promise<void>
  // Switches the account: with another one, what was stored is discarded
  configure(account: ConnectionFields | undefined): Promise<void>
  onChange(listener: (snapshot: ViewSnapshot) => void): Unsubscribe
}

type Memory = { -readonly [K in keyof ViewSnapshot]: ViewSnapshot[K] }

// The address alone for an account without an e-mail, so a cache written before connectors still matches
export const accountScope = (account: ConnectionFields): string =>
  account.email === undefined ? account.url : `${account.email} ${account.url}`

export function createViewsService(options: ViewsServiceOptions): ViewsService {
  const { cache, clock, logger, views } = options
  let account: ConnectionFields | undefined
  let scope: string | undefined
  let loaded: Promise<void> | undefined
  const memory = new Map<string, Memory>()
  const running = new Map<string, Promise<void>>()
  const listeners = new Set<(snapshot: ViewSnapshot) => void>()

  const blank = (view: string): Memory => ({
    view,
    items: [],
    updatedAt: undefined,
    state: scope === undefined ? 'unconfigured' : 'idle',
    error: undefined,
  })
  const entry = (view: string) => {
    if (!views.includes(view)) throw new Error(`invariant: ${view} is not a view of this service`)
    const found = memory.get(view) ?? blank(view)
    memory.set(view, found)
    return found
  }
  const emit = (view: string) => {
    const snapshot = { ...entry(view) }
    for (const listener of listeners) listener(snapshot)
  }

  async function persist() {
    if (scope === undefined) return
    const stored: Record<string, CachedView> = {}
    for (const view of views) {
      const { items, updatedAt } = entry(view)
      if (updatedAt !== undefined) stored[view] = { items, updatedAt }
    }
    await cache.save({ scope, views: stored })
  }

  // The file only applies to the current account; reads once per scope
  function load(): Promise<void> {
    loaded ??= (async () => {
      const data = await cache.load()
      if (!data || data.scope !== scope) return
      for (const view of views) {
        const cached = data.views[view]
        if (cached) Object.assign(entry(view), cached)
      }
    })()
    return loaded
  }

  async function fetchView(view: string) {
    const startedScope = scope
    const startedAccount = account
    const state = entry(view)
    const source = startedAccount === undefined ? undefined : await options.source(startedAccount)
    if (scope !== startedScope) return
    if (!source) {
      state.state = 'unconfigured'
      state.items = []
      state.updatedAt = undefined
      return emit(view)
    }
    state.state = 'refreshing'
    emit(view)
    const result = await source.items(view)
    // The account changed during the fetch: the result belongs to another account and is dropped
    if (scope !== startedScope) return
    if (result.ok) {
      state.items = result.value
      state.updatedAt = clock.now()
      state.state = 'idle'
      state.error = undefined
    } else {
      state.state = 'error'
      state.error = errorCodeOf(result.error)
      logger.warn('view refresh failed', { view, code: state.error })
    }
    emit(view)
    if (result.ok) await persist()
  }

  async function refresh(view: string) {
    await load()
    const current = running.get(view)
    if (current) return current
    const started = fetchView(view).finally(() => running.delete(view))
    running.set(view, started)
    return started
  }

  return {
    views,

    async snapshot(view) {
      await load()
      return { ...entry(view) }
    },

    refresh,

    async refreshIfStale(view, maxAgeMs) {
      await load()
      const { updatedAt } = entry(view)
      if (updatedAt !== undefined && clock.now() - updatedAt < maxAgeMs) return
      await refresh(view)
    },

    async configure(next) {
      const nextScope = next === undefined ? undefined : accountScope(next)
      if (nextScope === scope) return
      account = next
      scope = nextScope
      memory.clear()
      loaded = undefined
      for (const view of views) emit(view)
    },

    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
