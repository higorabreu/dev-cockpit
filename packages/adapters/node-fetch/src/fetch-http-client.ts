import { errorBody, fail, type HttpClient, ok } from '@dck/core'

const DEFAULT_TIMEOUT_MS = 10_000

export function createFetchHttpClient(fetchImpl: typeof fetch = fetch): HttpClient {
  return {
    async get({ url, headers, timeoutMs = DEFAULT_TIMEOUT_MS }) {
      try {
        const response = await fetchImpl(url, {
          headers: { ...headers },
          signal: AbortSignal.timeout(timeoutMs),
        })
        const received: Record<string, string> = {}
        response.headers.forEach((value, name) => {
          received[name.toLowerCase()] = value
        })
        return ok({ status: response.status, headers: received, body: await response.text() })
      } catch (error) {
        return fail(errorBody('DCK-NET-001', String(error)))
      }
    },
  }
}
