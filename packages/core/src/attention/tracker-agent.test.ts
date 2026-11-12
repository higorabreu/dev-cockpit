import { describe, expect, it } from 'vitest'
import { agentSignalSchema } from './agent-signal.ts'
import { createAttentionTracker } from './tracker.ts'

function setup() {
  let now = 0
  const tracker = createAttentionTracker({ clock: { now: () => now } })
  return {
    tracker,
    advance: (ms: number) => {
      now += ms
    },
    now: () => now,
  }
}

const agent = { activity: 'busy' as const, process: 'claude' }
const shell = { activity: 'idle' as const, process: 'zsh' }
const outOfSight = () => false
const outputAt = (time: number) => () => time

describe('createAttentionTracker with agent signals', () => {
  it('should mark the tab and ask for a notification when the agent needs the user out of sight', () => {
    const { tracker } = setup()

    const event = tracker.signal('a', 'needs-you', false)

    expect(event).toEqual({ kind: 'needs-you', tabId: 'a', notify: true })
    expect(tracker.attention('a')).toBe('needs-you')
    expect(tracker.unseenIds()).toEqual(['a'])
  })

  it('should not mark the tab when the agent needs the user while they look at it', () => {
    const { tracker } = setup()

    expect(tracker.signal('a', 'needs-you', true)).toBeUndefined()
    expect(tracker.unseenIds()).toEqual([])
  })

  it('should notify once when the agent repeats that it needs the user', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'needs-you', false)
    advance(6000)

    expect(tracker.signal('a', 'needs-you', false)).toBeUndefined()
  })

  it('should mark a finished turn when the agent worked long enough out of sight', () => {
    const { tracker, advance } = setup()
    tracker.update('a', agent, false)
    tracker.signal('a', 'working', false)
    advance(5000)

    const event = tracker.signal('a', 'your-turn', false)

    expect(event).toEqual({
      kind: 'finished',
      tabId: 'a',
      process: 'claude',
      durationMs: 5000,
      notify: false,
    })
    expect(tracker.attention('a')).toBe('finished')
    expect(tracker.finished('a')).toEqual({ process: 'claude', durationMs: 5000 })
  })

  it('should notify a finished turn when it lasted past the notify threshold', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', false)
    advance(40_000)

    expect(tracker.signal('a', 'your-turn', false)?.notify).toBe(true)
  })

  it('should not mark a turn when it was shorter than the mark threshold', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', false)
    advance(1000)

    expect(tracker.signal('a', 'your-turn', false)).toBeUndefined()
  })

  it('should measure the turn from its first working signal when the agent asked in between', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', true)
    advance(2000)
    tracker.signal('a', 'needs-you', true)
    advance(2000)
    tracker.signal('a', 'working', true)
    advance(2000)

    expect(tracker.signal('a', 'your-turn', false)).toMatchObject({ durationMs: 6000 })
  })

  it('should ignore your turn when no turn was running', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', false)
    advance(5000)
    tracker.signal('a', 'your-turn', true)
    advance(60_000)

    expect(tracker.signal('a', 'your-turn', false)).toBeUndefined()
  })

  it('should end the turn when a working agent left the terminal quiet for five seconds', () => {
    const { tracker, advance, now } = setup()
    tracker.signal('a', 'working', false)
    advance(4000)
    const lastOutput = now()
    advance(4999)
    expect(tracker.settle(outputAt(lastOutput), outOfSight)).toEqual([])
    advance(1)

    const events = tracker.settle(outputAt(lastOutput), outOfSight)

    expect(events).toEqual([
      { kind: 'finished', tabId: 'a', process: '', durationMs: 4000, notify: false },
    ])
    expect(tracker.hasWorkingAgent()).toBe(false)
  })

  it('should not end the turn when the terminal was quiet only before the working signal', () => {
    const { tracker, advance } = setup()
    advance(60_000)
    tracker.signal('a', 'working', false)
    advance(1000)

    expect(tracker.settle(outputAt(0), outOfSight)).toEqual([])
    expect(tracker.hasWorkingAgent()).toBe(true)
  })

  it('should leave a tab that needs the user alone when its terminal is quiet', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', false)
    tracker.signal('a', 'needs-you', false)
    advance(60_000)

    expect(tracker.settle(outputAt(0), outOfSight)).toEqual([])
    expect(tracker.attention('a')).toBe('needs-you')
  })

  it('should clear the needs you mark when the user types into the tab', () => {
    const { tracker } = setup()
    tracker.signal('a', 'needs-you', false)

    tracker.input('a')

    expect(tracker.attention('a')).toBeUndefined()
    expect(tracker.hasWorkingAgent()).toBe(true)
  })

  it('should clear the needs you mark when a new working signal arrives', () => {
    const { tracker } = setup()
    tracker.signal('a', 'needs-you', false)

    tracker.signal('a', 'working', false)

    expect(tracker.unseenIds()).toEqual([])
  })

  it('should keep a finished mark when the user types into the tab', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', false)
    advance(5000)
    tracker.signal('a', 'your-turn', false)

    tracker.input('a')

    expect(tracker.attention('a')).toBe('finished')
  })

  it('should clear the agent state and its needs you mark when the agent ends', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', false)
    tracker.signal('a', 'needs-you', false)

    tracker.signal('a', 'ended', false)
    advance(60_000)

    expect(tracker.unseenIds()).toEqual([])
    expect(tracker.hasWorkingAgent()).toBe(false)
    expect(tracker.signal('a', 'your-turn', false)).toBeUndefined()
  })

  it('should forget the agent state when the agent process leaves the foreground', () => {
    const { tracker, advance } = setup()
    tracker.update('a', agent, true)
    tracker.signal('a', 'working', true)
    advance(1000)

    tracker.update('a', shell, true)

    expect(tracker.hasWorkingAgent()).toBe(false)
  })

  it('should keep one list in order of arrival when tabs need the user and finished', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', false)
    advance(5000)
    tracker.signal('a', 'your-turn', false)
    tracker.signal('b', 'needs-you', false)

    expect(tracker.unseenIds()).toEqual(['a', 'b'])
    expect(tracker.attention('a')).toBe('finished')
    expect(tracker.attention('b')).toBe('needs-you')
  })

  it('should visit a tab that needs the user first when several are unseen', () => {
    const { tracker, advance } = setup()
    tracker.signal('a', 'working', false)
    advance(5000)
    tracker.signal('a', 'your-turn', false)
    tracker.signal('b', 'needs-you', false)
    tracker.signal('c', 'needs-you', false)

    expect(tracker.nextUnseen()).toBe('b')
    tracker.markSeen('b')
    tracker.markSeen('c')
    expect(tracker.nextUnseen()).toBe('a')
  })

  it('should not report a finished command for a needs you mark when asked what finished', () => {
    const { tracker } = setup()
    tracker.signal('a', 'needs-you', false)

    expect(tracker.finished('a')).toBeUndefined()
  })
})

describe('agentSignalSchema', () => {
  it('should accept a known state for a terminal when parsing a signal', () => {
    expect(agentSignalSchema.safeParse({ ptyId: 3, state: 'needs-you' }).success).toBe(true)
  })

  it('should reject an unknown state or a negative terminal when parsing a signal', () => {
    expect(agentSignalSchema.safeParse({ ptyId: 3, state: 'done' }).success).toBe(false)
    expect(agentSignalSchema.safeParse({ ptyId: -1, state: 'working' }).success).toBe(false)
  })
})
