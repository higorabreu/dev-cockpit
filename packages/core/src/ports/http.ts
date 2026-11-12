import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'

export interface HttpRequest {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly timeoutMs?: number
}

export interface HttpResponse {
  readonly status: number
  // Nomes em minúsculas
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

// Só falha quando não há resposta (rede, DNS, tempo esgotado); status de erro é uma resposta
export interface HttpClient {
  get(request: HttpRequest): Promise<Result<HttpResponse, ErrorBody>>
}
