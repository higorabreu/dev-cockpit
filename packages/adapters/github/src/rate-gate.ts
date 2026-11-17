import type { Clock, HttpResponse } from '@dck/core'

// GitHub counts the search apart from the rest of the API, with a much lower limit
export type RateResource = 'core' | 'search'

// A secondary limit can come with no reset and no wait: back off a minute
const DEFAULT_WAIT_MS = 60_000
// A reset further away than the hourly window is not trusted
const MAX_WAIT_MS = 60 * 60_000

export interface RateGate {
  // Milliseconds until the resource may be called again; 0 when it may be called now
  waitFor(resource: RateResource): number
  // The requests the last response said were left; undefined before any
  remaining(resource: RateResource): number | undefined
  // Reads the limit headers of a response; true when the response refused the request for the limit
  record(resource: RateResource, response: HttpResponse): boolean
}

const numberOf = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// A 403 is a limit only when GitHub says so; otherwise it is a missing permission
function refusedForLimit(response: HttpResponse, remaining: number | undefined): boolean {
  if (response.status === 429) return true
  if (response.status !== 403) return false
  return (
    remaining === 0 ||
    response.headers['retry-after'] !== undefined ||
    /rate limit/i.test(response.body)
  )
}

// Kept for the life of an account's views, so a limit reached in one refresh holds for the next ones
export function createRateGate(clock: Clock): RateGate {
  const blockedUntil = new Map<RateResource, number>()
  const left = new Map<RateResource, number>()

  return {
    waitFor: (resource) => Math.max(0, (blockedUntil.get(resource) ?? 0) - clock.now()),

    remaining: (resource) => left.get(resource),

    record(resource, response) {
      const now = clock.now()
      const remaining = numberOf(response.headers['x-ratelimit-remaining'])
      const reset = numberOf(response.headers['x-ratelimit-reset'])
      const retryAfter = numberOf(response.headers['retry-after'])
      if (remaining !== undefined) left.set(resource, remaining)
      const refused = refusedForLimit(response, remaining)
      if (refused || remaining === 0) {
        const until =
          retryAfter !== undefined
            ? now + retryAfter * 1000
            : reset !== undefined
              ? reset * 1000
              : now + DEFAULT_WAIT_MS
        // A refusal whose reset already passed still waits, so the next refresh does not hit it again
        const wait = until > now ? until - now : refused ? DEFAULT_WAIT_MS : 0
        blockedUntil.set(resource, now + Math.min(wait, MAX_WAIT_MS))
      }
      return refused
    },
  }
}
