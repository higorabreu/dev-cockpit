import { FakeDockWindow, FakeScreen } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { logDockWindow, logScreen } from './dock-log.ts'

function recordingLogger() {
  const lines: string[] = []
  const log = (message: string) => lines.push(message)
  return { lines, logger: { info: log, warn: log, error: log } }
}

const area = { x: 0, y: 0, width: 100, height: 100 }

describe('dock logging', () => {
  it('should log the cursor and the chosen display when resolving the display', () => {
    const { lines, logger } = recordingLogger()
    const display = { id: '1', bounds: area, workArea: area }
    const screen = logScreen(new FakeScreen([display], { x: 5, y: 5 }), logger)

    screen.displayNearest(screen.cursorPoint())

    expect(lines).toEqual(['dock cursor', 'dock display'])
  })

  it('should log the requested bounds and still apply them when setting bounds', () => {
    const { lines, logger } = recordingLogger()
    const inner = new FakeDockWindow()
    const window = logDockWindow(inner, logger)

    window.setBounds({ x: 1, y: 2, width: 3, height: 4 })

    expect(lines).toEqual(['dock setBounds'])
    window.show()
    expect(inner.bounds()).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})
