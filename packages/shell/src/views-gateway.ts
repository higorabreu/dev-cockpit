import {
  type ErrorBody,
  errorCodeOf,
  type Logger,
  type MergeRequestView,
  type Result,
  type ViewSnapshot,
  viewSnapshotSchema,
} from '@dck/core'

export interface ViewsGatewayDeps {
  request(method: string, params?: unknown): Promise<Result<unknown, ErrorBody>>
  readonly logger: Logger
}

export interface ViewsGateway {
  snapshot(view: MergeRequestView): Promise<ViewSnapshot | undefined>
  refresh(view: MergeRequestView, maxAgeMs?: number): Promise<ViewSnapshot | undefined>
  // O endereço da conta; nulo quando não há conexão
  configure(url: string | null): Promise<void>
  // Para o que o daemon publica sem ter sido pedido
  parse(data: unknown): ViewSnapshot | undefined
}

// A interface só fala com o shell; o shell fala com o daemon e valida o que volta
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
    async configure(url) {
      const result = await deps.request('views.configure', { url })
      if (!result.ok)
        logger.warn('could not configure the views', { code: result.error.data?.code })
    },
    parse,
  }
}
