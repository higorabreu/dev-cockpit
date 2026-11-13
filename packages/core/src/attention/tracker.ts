import type { Clock } from '../ports/clock.ts'
import type { SessionActivity } from '../ports/session.ts'
import type { AgentState } from './agent-signal.ts'

export interface FinishedCommand {
  readonly process: string
  readonly durationMs: number
}

export interface FinishedEvent extends FinishedCommand {
  readonly tabId: string
  // Long enough to deserve a system notification
  readonly notify: boolean
}

// Why an unseen tab is marked: an agent stopped to ask, or something finished
export type AttentionKind = 'needs-you' | 'finished'

export type AgentEvent =
  | { readonly kind: 'needs-you'; readonly tabId: string; readonly notify: true }
  | ({ readonly kind: 'finished' } & FinishedEvent)

export interface AttentionOptions {
  readonly clock: Clock
  readonly markAfterMs?: number
  // A function lets the threshold change from settings while the app is open
  readonly notifyAfterMs?: number | (() => number)
  readonly quietAfterMs?: number
}

interface TabState {
  startedAt?: number
  process?: string
  activity?: SessionActivity
  foreground?: string
  agent?: Exclude<AgentState, 'ended'>
  turnStartedAt?: number
  workingAt?: number
}

type Unseen =
  | { readonly kind: 'finished'; readonly command: FinishedCommand }
  | { readonly kind: 'needs-you' }

const DEFAULT_MARK_AFTER_MS = 3000
const DEFAULT_NOTIFY_AFTER_MS = 30_000
// Esc fires no agent signal, but a working agent redraws its spinner many times a second
const DEFAULT_QUIET_AFTER_MS = 5000

// Detects when something that was running in a tab finishes, or an agent needs the user, out of sight
export function createAttentionTracker(options: AttentionOptions) {
  const markAfter = options.markAfterMs ?? DEFAULT_MARK_AFTER_MS
  const quietAfter = options.quietAfterMs ?? DEFAULT_QUIET_AFTER_MS
  const notifyAfter = () => {
    const value = options.notifyAfterMs
    return typeof value === 'function' ? value() : (value ?? DEFAULT_NOTIFY_AFTER_MS)
  }
  const tabs = new Map<string, TabState>()
  // In order of arrival: the oldest first
  const unseen = new Map<string, Unseen>()

  function stateOf(tabId: string): TabState {
    const state = tabs.get(tabId) ?? {}
    tabs.set(tabId, state)
    return state
  }

  function mark(tabId: string, entry: Unseen) {
    unseen.delete(tabId)
    unseen.set(tabId, entry)
  }

  function clearNeedsYou(tabId: string) {
    if (unseen.get(tabId)?.kind === 'needs-you') unseen.delete(tabId)
  }

  function clearAgent(state: TabState) {
    state.agent = undefined
    state.turnStartedAt = undefined
    state.workingAt = undefined
  }

  // The agent's turn ends like a command: marked when it worked long enough out of sight
  function endTurn(
    tabId: string,
    state: TabState,
    endedAt: number,
    seen: boolean,
  ): AgentEvent | undefined {
    const startedAt = state.turnStartedAt
    clearAgent(state)
    state.agent = 'your-turn'
    clearNeedsYou(tabId)
    if (startedAt === undefined || seen) return undefined
    const durationMs = endedAt - startedAt
    if (durationMs < markAfter) return undefined
    const process = state.process ?? state.foreground ?? ''
    mark(tabId, { kind: 'finished', command: { process, durationMs } })
    return { kind: 'finished', tabId, process, durationMs, notify: durationMs >= notifyAfter() }
  }

  return {
    update(
      tabId: string,
      current: { activity: SessionActivity; process: string },
      seen: boolean,
    ): FinishedEvent | undefined {
      const state = stateOf(tabId)
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
          mark(tabId, { kind: 'finished', command: { process, durationMs } })
          event = { tabId, process, durationMs, notify: durationMs >= notifyAfter() }
        }
        state.startedAt = undefined
        state.process = undefined
        // The agent left the foreground: whatever it last signalled no longer holds
        clearAgent(state)
        clearNeedsYou(tabId)
      }
      state.activity = current.activity
      state.foreground = current.process
      return event
    },
    signal(tabId: string, agentState: AgentState, seen: boolean): AgentEvent | undefined {
      const state = stateOf(tabId)
      const now = options.clock.now()
      if (agentState === 'working') {
        if (state.agent !== 'working' && state.agent !== 'needs-you') state.turnStartedAt = now
        state.agent = 'working'
        state.workingAt = now
        clearNeedsYou(tabId)
        return undefined
      }
      // Marked even on screen, because the agent stays blocked; only an unseen tab is notified
      if (agentState === 'needs-you') {
        state.agent = 'needs-you'
        if (unseen.get(tabId)?.kind === 'needs-you') return undefined
        mark(tabId, { kind: 'needs-you' })
        return seen ? undefined : { kind: 'needs-you', tabId, notify: true }
      }
      if (agentState === 'your-turn') return endTurn(tabId, state, now, seen)
      clearAgent(state)
      clearNeedsYou(tabId)
      return undefined
    },
    // The user typing into the tab answers the agent, which then goes back to work
    input(tabId: string) {
      const state = tabs.get(tabId)
      if (state?.agent !== 'needs-you') return
      state.agent = 'working'
      state.workingAt = options.clock.now()
      clearNeedsYou(tabId)
    },
    // A working agent whose terminal went quiet was interrupted (Esc fires no hook): the turn just ends,
    // silently, since a quiet agent may still be working and the user who pressed Esc is looking
    settle(lastOutputAt: (tabId: string) => number | undefined) {
      const now = options.clock.now()
      for (const [tabId, state] of tabs) {
        if (state.agent !== 'working') continue
        const quietSince = Math.max(lastOutputAt(tabId) ?? 0, state.workingAt ?? 0)
        if (now - quietSince >= quietAfter) endTurn(tabId, state, quietSince, true)
      }
    },
    hasWorkingAgent: () => [...tabs.values()].some((state) => state.agent === 'working'),
    // A tab that needs the user keeps its mark until the agent moves on, even after a look
    markSeen(tabId: string) {
      if (unseen.get(tabId)?.kind !== 'needs-you') unseen.delete(tabId)
    },
    finished(tabId: string): FinishedCommand | undefined {
      const entry = unseen.get(tabId)
      return entry?.kind === 'finished' ? entry.command : undefined
    },
    attention: (tabId: string): AttentionKind | undefined => unseen.get(tabId)?.kind,
    marks: (): ReadonlyMap<string, AttentionKind> =>
      new Map([...unseen].map(([tabId, entry]) => [tabId, entry.kind])),
    unseenIds: () => [...unseen.keys()],
    // Tabs that need the user come first: the agent is blocked until they answer
    nextUnseen(currentId?: string): string | undefined {
      const entries = [...unseen].filter(([tabId]) => tabId !== currentId)
      return (entries.find(([, entry]) => entry.kind === 'needs-you') ?? entries[0])?.[0]
    },
    forget(tabId: string) {
      tabs.delete(tabId)
      unseen.delete(tabId)
    },
  }
}

export type AttentionTracker = ReturnType<typeof createAttentionTracker>
