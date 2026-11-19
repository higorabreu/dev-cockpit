// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { attachCursorBlink, BLINK_MS, CURSOR_OFF } from './cursor-blink.ts'

// A clock the test moves by hand: runs every task whose time has come
function fakeClock() {
  let now = 0
  let tasks: { at: number; task: () => void }[] = []
  return {
    after(milliseconds: number, task: () => void) {
      const entry = { at: now + milliseconds, task }
      tasks.push(entry)
      return () => {
        tasks = tasks.filter((candidate) => candidate !== entry)
      }
    },
    advance(milliseconds: number) {
      const end = now + milliseconds
      for (;;) {
        const next = tasks.filter((entry) => entry.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!next) break
        tasks = tasks.filter((entry) => entry !== next)
        now = next.at
        next.task()
      }
      now = end
    },
    pending: () => tasks.length,
  }
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

function setup({ focus = true } = {}) {
  const element = document.createElement('div')
  const textarea = document.createElement('textarea')
  element.appendChild(textarea)
  document.body.replaceChildren(element)
  if (focus) textarea.focus()
  const clock = fakeClock()
  const blink = attachCursorBlink({ element, textarea, document, after: clock.after })
  const off = () => element.classList.contains(CURSOR_OFF)
  return { element, textarea, clock, blink, off }
}

afterEach(() => {
  setHidden(false)
})

describe('attachCursorBlink', () => {
  it('should hide and show the cursor every half period when the terminal has the focus', () => {
    // Arrange
    const { clock, off } = setup()

    // Act
    const phases = [off()]
    for (let step = 0; step < 4; step++) {
      clock.advance(BLINK_MS)
      phases.push(off())
    }

    // Assert
    expect(phases).toEqual([false, true, false, true, false])
  })

  it('should keep the cursor shown and run no timer when the terminal has no focus', () => {
    // Arrange
    const { clock, off } = setup({ focus: false })

    // Act
    clock.advance(BLINK_MS * 3)

    // Assert
    expect(off()).toBe(false)
    expect(clock.pending()).toBe(0)
  })

  it('should stop blinking with the cursor shown when the terminal loses the focus', () => {
    // Arrange
    const { textarea, clock, off } = setup()
    clock.advance(BLINK_MS)

    // Act
    textarea.blur()
    clock.advance(BLINK_MS * 3)

    // Assert
    expect(off()).toBe(false)
    expect(clock.pending()).toBe(0)
  })

  it('should stop blinking when the window is hidden and blink again when it is shown', () => {
    // Arrange
    const { clock, off } = setup()

    // Act
    setHidden(true)
    const pendingWhileHidden = clock.pending()
    setHidden(false)
    clock.advance(BLINK_MS)

    // Assert
    expect(pendingWhileHidden).toBe(0)
    expect(off()).toBe(true)
  })

  it('should show the cursor and start the period again when the cursor moves', () => {
    // Arrange
    const { blink, clock, off } = setup()
    clock.advance(BLINK_MS)

    // Act
    blink.restart()
    const shownAtOnce = !off()
    clock.advance(BLINK_MS - 1)

    // Assert
    expect(shownAtOnce).toBe(true)
    expect(off()).toBe(false)
  })

  it('should run no timer and leave the class alone when the session is disposed', () => {
    // Arrange
    const { blink, textarea, clock } = setup()

    // Act
    blink.dispose()
    textarea.blur()
    textarea.focus()

    // Assert
    expect(clock.pending()).toBe(0)
  })
})
