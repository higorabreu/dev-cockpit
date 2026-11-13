import type { AgentProfile } from '../ports/agent.ts'
import type { Clock } from '../ports/clock.ts'

export interface ConnectHintOptions {
  readonly clock: Clock
  // Read on every check: the user turns the hint off with "Not now" and back on in settings
  enabled(): boolean
  readonly afterMs?: number
}

interface TabState {
  agent?: AgentProfile
  since?: number
  signalled: boolean
  handled: boolean
}

// A connected agent signals as soon as it starts, so one that stays silent this long is not connected
const DEFAULT_AFTER_MS = 10_000

// Decides when a tab running a known agent suggests connecting it, so its marks can appear
export function createConnectHint(options: ConnectHintOptions) {
  const afterMs = options.afterMs ?? DEFAULT_AFTER_MS
  const tabs = new Map<string, TabState>()

  return {
    // The agent in the tab's foreground, or undefined for a shell or any other command
    update(tabId: string, agent: AgentProfile | undefined) {
      const state = tabs.get(tabId)
      if (!agent) {
        // The first signal can arrive before the watcher sees the agent; only an agent seen can leave
        if (state?.agent) tabs.delete(tabId)
        return
      }
      if (state?.agent?.id === agent.id) return
      tabs.set(tabId, {
        agent,
        since: options.clock.now(),
        signalled: state !== undefined && state.agent === undefined && state.signalled,
        handled: false,
      })
    },
    // Any signal from the tab proves its agent is connected
    signal(tabId: string) {
      const state = tabs.get(tabId)
      if (state) state.signalled = true
      else tabs.set(tabId, { signalled: true, handled: false })
    },
    // Connect typed the command: the hint has done its job for this run of the agent
    handled(tabId: string) {
      const state = tabs.get(tabId)
      if (state) state.handled = true
    },
    // The agent to suggest connecting in this tab, if the hint shows now
    shown(tabId: string): AgentProfile | undefined {
      const state = tabs.get(tabId)
      if (!state?.agent?.connect || state.since === undefined) return undefined
      if (state.signalled || state.handled || !options.enabled()) return undefined
      return options.clock.now() - state.since >= afterMs ? state.agent : undefined
    },
    forget(tabId: string) {
      tabs.delete(tabId)
    },
  }
}

export type ConnectHint = ReturnType<typeof createConnectHint>
