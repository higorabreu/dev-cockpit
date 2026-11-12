import { errorCodeOf } from '../errors.ts'
import type { Clock } from '../ports/clock.ts'
import type { CodeReviewSource, MergeRequestView } from '../ports/code-review.ts'
import type { Logger } from '../ports/logger.ts'
import type { Unsubscribe } from '../ports/pty.ts'
import type { CachedView, ViewCache, ViewSnapshot } from '../ports/views.ts'

export interface ViewsServiceOptions {
  // Indefinida quando não há conexão (sem endereço ou sem token)
  source(): Promise<CodeReviewSource | undefined>
  readonly cache: ViewCache
  readonly clock: Clock
  readonly logger: Logger
}

export interface ViewsService {
  // Devolve o que há guardado na hora, sem esperar a rede
  snapshot(view: MergeRequestView): Promise<ViewSnapshot>
  // Busca no servidor; chamadas simultâneas da mesma visão dividem a mesma busca
  refresh(view: MergeRequestView): Promise<void>
  refreshIfStale(view: MergeRequestView, maxAgeMs: number): Promise<void>
  // Troca a conta: com outro escopo, o que estava guardado é descartado
  configure(scope: string | undefined): Promise<void>
  onChange(listener: (snapshot: ViewSnapshot) => void): Unsubscribe
}

type Memory = { -readonly [K in keyof ViewSnapshot]: ViewSnapshot[K] }

const VIEWS: readonly MergeRequestView[] = ['review', 'mine']

export function createViewsService(options: ViewsServiceOptions): ViewsService {
  const { cache, clock, logger } = options
  let scope: string | undefined
  let loaded: Promise<void> | undefined
  const memory = new Map<MergeRequestView, Memory>()
  const running = new Map<MergeRequestView, Promise<void>>()
  const listeners = new Set<(snapshot: ViewSnapshot) => void>()

  const blank = (view: MergeRequestView): Memory => ({
    view,
    items: [],
    updatedAt: undefined,
    state: scope === undefined ? 'unconfigured' : 'idle',
    error: undefined,
  })
  const entry = (view: MergeRequestView) => {
    const found = memory.get(view) ?? blank(view)
    memory.set(view, found)
    return found
  }
  const emit = (view: MergeRequestView) => {
    const snapshot = { ...entry(view) }
    for (const listener of listeners) listener(snapshot)
  }

  async function persist() {
    if (scope === undefined) return
    const views: Partial<Record<MergeRequestView, CachedView>> = {}
    for (const view of VIEWS) {
      const { items, updatedAt } = entry(view)
      if (updatedAt !== undefined) views[view] = { items, updatedAt }
    }
    await cache.save({ scope, views })
  }

  // O arquivo só vale para a conta atual; lê uma vez por escopo
  function load(): Promise<void> {
    loaded ??= (async () => {
      const data = await cache.load()
      if (!data || data.scope !== scope) return
      for (const view of VIEWS) {
        const cached = data.views[view]
        if (cached) Object.assign(entry(view), cached)
      }
    })()
    return loaded
  }

  async function fetchView(view: MergeRequestView) {
    const startedScope = scope
    const state = entry(view)
    const source = await options.source()
    if (scope !== startedScope) return
    if (!source) {
      state.state = 'unconfigured'
      state.items = []
      state.updatedAt = undefined
      return emit(view)
    }
    state.state = 'refreshing'
    emit(view)
    const result = await source.mergeRequests(view)
    // A conta mudou durante a busca: o resultado é de outra conta e não entra
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

  async function refresh(view: MergeRequestView) {
    await load()
    const current = running.get(view)
    if (current) return current
    const started = fetchView(view).finally(() => running.delete(view))
    running.set(view, started)
    return started
  }

  return {
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
      if (next === scope) return
      scope = next
      memory.clear()
      loaded = undefined
      for (const view of VIEWS) emit(view)
    },

    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
