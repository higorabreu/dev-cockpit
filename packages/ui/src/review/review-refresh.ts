import type { AgentState } from '@dck/core'

export interface RefreshDeps {
  // Reads the diff again and draws it; a quiet read shows no loading text and keeps the reader's place
  load(quiet: boolean): Promise<void>
  // Changes when the repository's diff may have changed; undefined when it cannot tell
  fingerprint(): Promise<string | undefined>
  // The window is shown; a hidden one checks nothing
  visible(): boolean
  now(): number
  // A timer that can be cancelled, so tests drive it with a fake clock
  after(milliseconds: number, task: () => void): () => void
}

// An agent often signals twice in a row (a turn ends, then the session idles); one read covers both
export const AGENT_SETTLE_MS = 400
// How often an open review asks whether the change moved, and how far that stretches on a slow repository
export const WATCH_MS = 2000
export const WATCH_MAX_MS = 16_000
export const SLOW_CHECK_MS = 300

// When the review reads the diff: on open, on Ctrl+R, when the tab's agent changes state, and when the
// repository's fingerprint changes while it is open and the window shown; never while it is closed. A
// request during a read runs once that read ends
export function createReviewRefresh(deps: RefreshDeps) {
  let open = false
  let running = false
  let again = false
  let checking = false
  let lastAgent: AgentState | undefined
  let cancel: (() => void) | undefined
  let stopWatch: (() => void) | undefined
  let print: string | undefined
  let interval = WATCH_MS

  function watch() {
    stopWatch?.()
    stopWatch = undefined
    if (open && deps.visible()) stopWatch = deps.after(interval, () => void check())
  }

  async function run(quiet = false) {
    cancel?.()
    cancel = undefined
    if (!open) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      // Taken alongside the read: a change during it differs from this print and reads once more
      const [next] = await Promise.all([deps.fingerprint(), deps.load(quiet)])
      print = next
    } finally {
      running = false
    }
    if (again) {
      again = false
      await run()
      return
    }
    watch()
  }

  async function check() {
    stopWatch = undefined
    if (!open || running || checking || !deps.visible()) return
    checking = true
    const started = deps.now()
    const next = await deps.fingerprint()
    checking = false
    interval =
      deps.now() - started > SLOW_CHECK_MS ? Math.min(interval * 2, WATCH_MAX_MS) : WATCH_MS
    if (!open) return
    if (next !== undefined && print !== undefined && next !== print) {
      await run(true)
      return
    }
    if (next !== undefined) print = next
    watch()
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
      stopWatch?.()
      stopWatch = undefined
    },
    request: () => void run(),
    // The window was shown or hidden: a shown one checks at once, a hidden one stops checking
    visibility() {
      if (!open) return
      if (deps.visible()) void check()
      else {
        stopWatch?.()
        stopWatch = undefined
      }
    },
    // Called with the tab's agent state whenever it may have changed; only a change reads again
    agentState(state: AgentState | undefined) {
      const changed = state !== lastAgent
      lastAgent = state
      if (!changed || !open) return
      cancel?.()
      cancel = deps.after(AGENT_SETTLE_MS, () => void run(true))
    },
  }
}
