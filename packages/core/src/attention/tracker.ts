import type { Clock } from '../ports/clock.ts'
import type { SessionActivity } from '../ports/session.ts'

export interface FinishedCommand {
  readonly process: string
  readonly durationMs: number
}

export interface FinishedEvent extends FinishedCommand {
  readonly tabId: string
  // Longo o bastante para valer uma notificação do sistema
  readonly notify: boolean
}

export interface AttentionOptions {
  readonly clock: Clock
  readonly markAfterMs?: number
  // Uma função permite mudar o limiar nas configurações com o app aberto
  readonly notifyAfterMs?: number | (() => number)
}

interface TabState {
  startedAt?: number
  process?: string
  activity?: SessionActivity
}

const DEFAULT_MARK_AFTER_MS = 3000
const DEFAULT_NOTIFY_AFTER_MS = 30_000

// Reconhece quando algo que rodava na aba termina fora da vista do usuário
export function createAttentionTracker(options: AttentionOptions) {
  const markAfter = options.markAfterMs ?? DEFAULT_MARK_AFTER_MS
  const notifyAfter = () => {
    const value = options.notifyAfterMs
    return typeof value === 'function' ? value() : (value ?? DEFAULT_NOTIFY_AFTER_MS)
  }
  const tabs = new Map<string, TabState>()
  // Em ordem de chegada: a mais antiga primeiro
  const unseen = new Map<string, FinishedCommand>()

  return {
    update(
      tabId: string,
      current: { activity: SessionActivity; process: string },
      seen: boolean,
    ): FinishedEvent | undefined {
      const state = tabs.get(tabId) ?? {}
      const wasRunning = state.activity === 'busy' || state.activity === 'agent'
      const isRunning = current.activity === 'busy' || current.activity === 'agent'
      let event: FinishedEvent | undefined

      if (isRunning && !wasRunning) {
        state.startedAt = options.clock.now()
        state.process = current.process
      }
      if (wasRunning && !isRunning && state.startedAt !== undefined) {
        const durationMs = options.clock.now() - state.startedAt
        const process = state.process ?? current.process
        if (!seen && durationMs >= markAfter) {
          unseen.delete(tabId)
          unseen.set(tabId, { process, durationMs })
          event = { tabId, process, durationMs, notify: durationMs >= notifyAfter() }
        }
        state.startedAt = undefined
        state.process = undefined
      }
      state.activity = current.activity
      tabs.set(tabId, state)
      return event
    },
    markSeen: (tabId: string) => unseen.delete(tabId),
    finished: (tabId: string) => unseen.get(tabId),
    unseenIds: () => [...unseen.keys()],
    forget(tabId: string) {
      tabs.delete(tabId)
      unseen.delete(tabId)
    },
  }
}
