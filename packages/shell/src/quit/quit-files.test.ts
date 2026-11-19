import { describe, expect, it } from 'vitest'
import { createQuitFiles, SETTLE_MS } from './quit-files.ts'

function setup() {
  const events: string[] = []
  let tasks: { at: number; task: () => void }[] = []
  let now = 0
  const files = createQuitFiles({
    settle: () => void events.push('settle'),
    present: () => void events.push('present'),
    quit: () => void events.push('quit'),
    after(milliseconds, task) {
      const entry = { at: now + milliseconds, task }
      tasks.push(entry)
      return () => {
        tasks = tasks.filter((candidate) => candidate !== entry)
      }
    },
  })
  const advance = (milliseconds: number) => {
    now += milliseconds
    const due = tasks.filter((entry) => entry.at <= now)
    tasks = tasks.filter((entry) => entry.at > now)
    for (const entry of due) entry.task()
  }
  return { files, events, advance }
}

describe('createQuitFiles', () => {
  it('should quit once the window says its files are saved', () => {
    const { files, events } = setup()

    files.request()
    files.answer('quit')

    expect(events).toEqual(['settle', 'quit'])
  })

  it('should stay open when the window says a file needs the user', () => {
    const { files, events, advance } = setup()

    files.request()
    files.answer('stay')
    advance(SETTLE_MS * 2)

    expect(events).toEqual(['settle'])
  })

  it('should quit anyway when the window does not answer in time', () => {
    const { files, events, advance } = setup()

    files.request()
    advance(SETTLE_MS)

    expect(events).toEqual(['settle', 'quit'])
  })

  it('should show the window and wait for the user without a limit when the window asks', () => {
    // Arrange
    const { files, events, advance } = setup()
    files.request()

    // Act
    files.answer('asking')
    advance(SETTLE_MS * 10)
    const waited = [...events]
    files.answer('quit')

    // Assert
    expect(waited).toEqual(['settle', 'present'])
    expect(events).toEqual(['settle', 'present', 'quit'])
  })

  it('should ignore an answer nobody asked for and a second request while one waits', () => {
    const { files, events } = setup()

    files.answer('quit')
    files.request()
    files.request()

    expect(events).toEqual(['settle'])
  })
})
