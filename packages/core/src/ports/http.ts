import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'

export interface HttpRequest {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly timeoutMs?: number
}

export interface HttpResponse {
  readonly status: number
  // Lowercase names
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

// Only fails when there is no response (network, DNS, timeout); an error status is a response
export interface HttpClient {
  get(request: HttpRequest): Promise<Result<HttpResponse, ErrorBody>>
}
