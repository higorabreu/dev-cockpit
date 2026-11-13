import { describe, expect, it } from 'vitest'
import { AGENT_SETTLE_MS, createReviewRefresh } from './review-refresh.ts'

function setup() {
  let now = 0
  const timers: { at: number; task: () => void; cancelled: boolean }[] = []
  const loads: number[] = []
  let finish: (() => void) | undefined
  let hold = false
  const refresh = createReviewRefresh({
    load: () => {
      loads.push(now)
      if (!hold) return Promise.resolve()
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    },
    after(milliseconds, task) {
      const timer = { at: now + milliseconds, task, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  })
  const advance = async (milliseconds: number) => {
    now += milliseconds
    for (const timer of timers.filter((entry) => !entry.cancelled && entry.at <= now)) {
      timer.cancelled = true
      timer.task()
    }
    await Promise.resolve()
  }
  return {
    refresh,
    loads,
    advance,
    holdLoads: () => {
      hold = true
    },
    finishLoad: async () => {
      hold = false
      finish?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
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
})
