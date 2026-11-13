import {
  type ConnectionFields,
  type ErrorBody,
  errorCodeOf,
  type Logger,
  type Result,
  type ViewSnapshot,
  viewSnapshotSchema,
} from '@dck/core'

export interface ViewsGatewayDeps {
  request(method: string, params?: unknown): Promise<Result<unknown, ErrorBody>>
  readonly logger: Logger
}

export interface ViewsGateway {
  snapshot(view: string): Promise<ViewSnapshot | undefined>
  refresh(view: string, maxAgeMs?: number): Promise<ViewSnapshot | undefined>
  // One connector's account; null when it is not connected or its extension is disabled
  configure(connector: string, account: ConnectionFields | null): Promise<void>
  // For what the daemon publishes without being asked
  parse(data: unknown): ViewSnapshot | undefined
}

// The UI only talks to the shell; the shell talks to the daemon and validates what comes back
export function createViewsGateway(deps: ViewsGatewayDeps): ViewsGateway {
  const { logger } = deps

  function parse(data: unknown): ViewSnapshot | undefined {
    const parsed = viewSnapshotSchema.safeParse(data)
    if (!parsed.success) {
      logger.warn('daemon sent an unexpected view snapshot')
      return undefined
    }
    const { view, items, updatedAt, state, error } = parsed.data
    return {
      view,
      items,
      updatedAt,
      state,
      error: error === undefined ? undefined : errorCodeOf({ data: { code: error } }),
    }
  }

  async function ask(method: string, params: unknown) {
    const result = await deps.request(method, params)
    if (!result.ok) {
      logger.warn('views request failed', { method, code: result.error.data?.code })
      return undefined
    }
    return parse(result.value)
  }

  return {
    snapshot: (view) => ask('views.snapshot', { view }),
    refresh: (view, maxAgeMs) => ask('views.refresh', { view, maxAgeMs }),
    async configure(connector, account) {
      const result = await deps.request('views.configure', { connector, account })
      if (!result.ok)
        logger.warn('could not configure the views', { connector, code: result.error.data?.code })
    },
    parse,
  }
}
