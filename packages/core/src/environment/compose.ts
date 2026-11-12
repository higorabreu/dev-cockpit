import type { ComposeContainer, ContainerState } from '../ports/environment.ts'

function stateOf(state: string, health: string): ContainerState {
  if (state === 'running') return health === 'starting' ? 'starting' : 'running'
  if (state === 'restarting' || state === 'created') return 'starting'
  if (state === 'paused') return 'paused'
  return 'stopped'
}

function toContainer(entry: unknown): ComposeContainer | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined
  const record = entry as Record<string, unknown>
  const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : '')
  const service = text('Service') || text('Name')
  if (!service) return undefined
  const health = text('Health')
  return {
    service,
    name: text('Name') || service,
    state: stateOf(text('State'), health),
    health: health === 'healthy' || health === 'unhealthy' ? health : undefined,
    status: text('Status'),
  }
}

// `docker compose ps --format json` prints one object per line; older versions print a single list
export function parseComposePs(output: string): readonly ComposeContainer[] {
  const trimmed = output.trim()
  if (trimmed === '') return []
  let entries: unknown[]
  try {
    const whole: unknown = JSON.parse(trimmed)
    entries = Array.isArray(whole) ? whole : [whole]
  } catch {
    entries = trimmed.split('\n').flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown]
      } catch {
        return []
      }
    })
  }
  return entries
    .flatMap((entry) => toContainer(entry) ?? [])
    .sort((a, b) => a.service.localeCompare(b.service))
}

export type UptimeUnit = 's' | 'min' | 'h' | 'd' | 'w' | 'mo'

const UNIT_OF: Record<string, UptimeUnit> = {
  second: 's',
  minute: 'min',
  hour: 'h',
  day: 'd',
  week: 'w',
  month: 'mo',
}

// "Up 17 hours (healthy)" becomes 17 hours; "Up About an hour" becomes 1 hour; with no time, undefined
export function uptimeParts(status: string): { unit: UptimeUnit; value: number } | undefined {
  const match =
    /^Up\s+(?:(About an?|Less than a|\d+)\s+)?(second|minute|hour|day|week|month)s?/i.exec(status)
  if (!match) return undefined
  const unit = UNIT_OF[(match[2] ?? '').toLowerCase()]
  if (!unit) return undefined
  const amount = match[1] ?? ''
  const value = /^\d+$/.test(amount) ? Number(amount) : 1
  return { unit, value }
}
