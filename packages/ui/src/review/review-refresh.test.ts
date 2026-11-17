import { describe, expect, it } from 'vitest'
import {
  AGENT_SETTLE_MS,
  createReviewRefresh,
  SLOW_CHECK_MS,
  WATCH_MAX_MS,
  WATCH_MS,
} from './review-refresh.ts'

function setup() {
  let now = 0
  const timers: { at: number; task: () => void; cancelled: boolean }[] = []
  const loads: number[] = []
  const quiet: boolean[] = []
  const checks: number[] = []
  let finish: (() => void) | undefined
  let hold = false
  let print = 'a'
  let checkTakes = 0
  let shown = true
  const refresh = createReviewRefresh({
    load: (isQuiet) => {
      loads.push(now)
      quiet.push(isQuiet)
      if (!hold) return Promise.resolve()
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    },
    fingerprint: async () => {
      checks.push(now)
      now += checkTakes
      return print
    },
    visible: () => shown,
    now: () => now,
    after(milliseconds, task) {
      const timer = { at: now + milliseconds, task, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  })
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
  // Runs the timers due in order, letting each one's promises settle before the next
  const advance = async (milliseconds: number) => {
    const target = now + milliseconds
    await flush()
    for (;;) {
      const due = timers
        .filter((entry) => !entry.cancelled && entry.at <= target)
        .sort((a, b) => a.at - b.at)[0]
      if (!due) break
      now = Math.max(now, due.at)
      due.cancelled = true
      due.task()
      await flush()
    }
    now = Math.max(now, target)
  }
  return {
    refresh,
    loads,
    quiet,
    checks,
    advance,
    change: (next: string) => {
      print = next
    },
    slowChecks: (milliseconds: number) => {
      checkTakes = milliseconds
    },
    show: (value: boolean) => {
      shown = value
    },
    holdLoads: () => {
      hold = true
    },
    finishLoad: async () => {
      hold = false
      finish?.()
      await flush()
    },
  }
}

describe('createReviewRefresh', () => {
  it('should read the diff once when the review opens', () => {
    const { refresh, loads } = setup()

    refresh.open()

    expect(loads).toEqual([0])
  })

  it('should run nothing when the agent changes state while the review is closed', async () => {
    const { refresh, loads, advance } = setup()

    refresh.agentState('working')
    refresh.agentState('your-turn')
    await advance(AGENT_SETTLE_MS * 10)
    refresh.request()

    expect(loads).toEqual([])
  })

  it('should read again once the agent settles when its state changes with the review open', async () => {
    const { refresh, loads, advance } = setup()
    refresh.open()

    refresh.agentState('working')
    await advance(100)
    refresh.agentState('your-turn')
    await advance(AGENT_SETTLE_MS - 1)
    const early = [...loads]
    await advance(1)

    expect(early).toEqual([0])
    expect(loads).toEqual([0, 100 + AGENT_SETTLE_MS])
  })

  it('should not read again when the agent repeats the same state', async () => {
    const { refresh, loads, advance } = setup()
    refresh.agentState('working')
    refresh.open()

    refresh.agentState('working')
    await advance(AGENT_SETTLE_MS * 2)

    expect(loads).toEqual([0])
  })

  it('should read right away when the user asks with Ctrl+R', async () => {
    const { refresh, loads, advance } = setup()
    refresh.open()
    await advance(5000)

    refresh.request()

    expect(loads).toEqual([0, 5000])
  })

  it('should cancel a pending read when the review closes before the agent settles', async () => {
    const { refresh, loads, advance } = setup()
    refresh.open()
    refresh.agentState('needs-you')

    refresh.close()
    await advance(AGENT_SETTLE_MS)

    expect(loads).toEqual([0])
  })

  it('should run one more read after the current one when asked during a read', async () => {
    const { refresh, loads, holdLoads, finishLoad } = setup()
    holdLoads()
    refresh.open()

    refresh.request()
    refresh.request()
    await finishLoad()

    expect(loads).toEqual([0, 0])
  })

  it('should read again quietly when the change moves while the review is open', async () => {
    // Arrange
    const { refresh, loads, quiet, advance, change } = setup()
    refresh.open()
    await advance(WATCH_MS)

    // Act
    change('b')
    await advance(WATCH_MS)

    // Assert
    expect(loads).toEqual([0, WATCH_MS * 2])
    expect(quiet).toEqual([false, true])
  })

  it('should only check, without reading, when the change stays the same', async () => {
    const { refresh, loads, checks, advance } = setup()
    refresh.open()

    await advance(WATCH_MS * 3)

    expect(loads).toEqual([0])
    expect(checks).toEqual([0, WATCH_MS, WATCH_MS * 2, WATCH_MS * 3])
  })

  it('should check nothing when the review is closed or the window hidden', async () => {
    const { refresh, checks, advance, show } = setup()
    refresh.open()
    refresh.close()
    await advance(WATCH_MS * 3)
    const whileClosed = [...checks]

    refresh.open()
    show(false)
    refresh.visibility()
    await advance(WATCH_MS * 3)

    expect(whileClosed).toEqual([0])
    expect(checks).toEqual([0, WATCH_MS * 3])
  })

  it('should check at once when the window is shown again', async () => {
    const { refresh, checks, advance, show } = setup()
    show(false)
    refresh.open()
    await advance(WATCH_MS * 3)

    show(true)
    refresh.visibility()
    await advance(0)

    expect(checks).toEqual([0, WATCH_MS * 3])
  })

  it('should stretch the interval when a check is slow, up to its limit', async () => {
    const { refresh, checks, advance, slowChecks } = setup()
    slowChecks(SLOW_CHECK_MS + 1)
    refresh.open()

    await advance(60_000)

    const gaps = checks.slice(1).map((at, index) => at - (checks[index] ?? 0))
    expect(gaps.slice(0, 4)).toEqual([
      WATCH_MS + SLOW_CHECK_MS + 1,
      WATCH_MS * 2 + SLOW_CHECK_MS + 1,
      WATCH_MS * 4 + SLOW_CHECK_MS + 1,
      WATCH_MS * 8 + SLOW_CHECK_MS + 1,
    ])
    expect(Math.max(...gaps)).toBe(WATCH_MAX_MS + SLOW_CHECK_MS + 1)
  })
})
