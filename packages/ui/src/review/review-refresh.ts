import type { AgentState } from '@dck/core'

export interface RefreshDeps {
  // Reads the diff again; the review draws what it gets
  load(): Promise<void>
  // A timer that can be cancelled, so tests drive it with a fake clock
  after(milliseconds: number, task: () => void): () => void
}

// An agent often signals twice in a row (a turn ends, then the session idles); one read covers both
export const AGENT_SETTLE_MS = 400

// When the review reads the diff: on open, on Ctrl+R and when the tab's agent changes state, and never
// while it is closed. A request during a read runs once that read ends
export function createReviewRefresh(deps: RefreshDeps) {
  let open = false
  let running = false
  let again = false
  let lastAgent: AgentState | undefined
  let cancel: (() => void) | undefined

  async function run() {
    cancel?.()
    cancel = undefined
    if (!open) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      await deps.load()
    } finally {
      running = false
    }
    if (again) {
      again = false
      await run()
    }
  }

  return {
    isOpen: () => open,
    open() {
      open = true
      void run()
    },
    close() {
      open = false
      again = false
      cancel?.()
      cancel = undefined
    },
    request: () => void run(),
    // Called with the tab's agent state whenever it may have changed; only a change reads again
    agentState(state: AgentState | undefined) {
      const changed = state !== lastAgent
      lastAgent = state
      if (!changed || !open) return
      cancel?.()
      cancel = deps.after(AGENT_SETTLE_MS, () => void run())
    },
  }
}
