import { describe, expect, it } from 'vitest'
import { createAttentionTracker } from './tracker.ts'

function setup() {
  let now = 0
  const tracker = createAttentionTracker({ clock: { now: () => now } })
  return {
    tracker,
    advance: (ms: number) => {
      now += ms
    },
  }
}

const busy = { activity: 'busy' as const, process: 'pnpm' }
const idle = { activity: 'idle' as const, process: 'zsh' }
const claude = { activity: 'claude' as const, process: 'claude' }

describe('createAttentionTracker', () => {
  it('should report a finished command when it ends out of sight after running a while', () => {
    const { tracker, advance } = setup()
    tracker.update('a', busy, false)
    advance(5000)

    const event = tracker.update('a', idle, false)

    expect(event).toEqual({ tabId: 'a', process: 'pnpm', durationMs: 5000, notify: false })
    expect(tracker.unseenIds()).toEqual(['a'])
    expect(tracker.finished('a')).toEqual({ process: 'pnpm', durationMs: 5000 })
  })

  it('should ask for a system notification when the command ran past the notify threshold', () => {
    const { tracker, advance } = setup()
    tracker.update('a', busy, false)
    advance(40_000)

    expect(tracker.update('a', idle, false)?.notify).toBe(true)
  })

  it('should not report anything when the user was looking at the tab as it finished', () => {
    const { tracker, advance } = setup()
    tracker.update('a', busy, true)
    advance(60_000)

    expect(tracker.update('a', idle, true)).toBeUndefined()
    expect(tracker.unseenIds()).toEqual([])
  })

  it('should ignore commands that finish before the mark threshold when running briefly', () => {
    const { tracker, advance } = setup()
    tracker.update('a', busy, false)
    advance(1000)

    expect(tracker.update('a', idle, false)).toBeUndefined()
  })

  it('should keep the first process name when the foreground process changes while running', () => {
    const { tracker, advance } = setup()
    tracker.update('a', busy, false)
    tracker.update('a', { activity: 'busy', process: 'node' }, false)
    advance(5000)

    expect(tracker.update('a', idle, false)?.process).toBe('pnpm')
  })

  it('should report the end of a claude session when the claude process exits', () => {
    const { tracker, advance } = setup()
    tracker.update('a', claude, false)
    advance(10_000)

    expect(tracker.update('a', idle, false)?.process).toBe('claude')
  })

  it('should clear the notice when the user sees the tab', () => {
    const { tracker, advance } = setup()
    tracker.update('a', busy, false)
    advance(5000)
    tracker.update('a', idle, false)

    tracker.markSeen('a')

    expect(tracker.unseenIds()).toEqual([])
  })

  it('should list the oldest finished tab first when several finished', () => {
    const { tracker, advance } = setup()
    tracker.update('a', busy, false)
    tracker.update('b', busy, false)
    advance(5000)
    tracker.update('b', idle, false)
    tracker.update('a', idle, false)

    expect(tracker.unseenIds()).toEqual(['b', 'a'])
  })

  it('should drop everything about a tab when it is closed', () => {
    const { tracker, advance } = setup()
    tracker.update('a', busy, false)
    advance(5000)
    tracker.update('a', idle, false)

    tracker.forget('a')

    expect(tracker.unseenIds()).toEqual([])
    expect(tracker.finished('a')).toBeUndefined()
  })

  it('should not report a finish when the tab was already idle', () => {
    const { tracker, advance } = setup()
    tracker.update('a', idle, false)
    advance(60_000)

    expect(tracker.update('a', idle, false)).toBeUndefined()
  })
})
