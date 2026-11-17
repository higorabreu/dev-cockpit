import { FakeDockWindow } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { logDockWindow, logScreen } from './dock-log.ts'
import type { SystemDisplay, SystemScreen } from './screen.ts'

function recordingLogger() {
  const lines: string[] = []
  const contexts: unknown[] = []
  const log = (message: string, context?: unknown) => {
    lines.push(message)
    contexts.push(context)
  }
  return { lines, contexts, logger: { info: log, warn: log, error: log } }
}

const area = { x: 0, y: 0, width: 100, height: 100 }

const sourcedScreen = (display: SystemDisplay): SystemScreen => ({
  cursorPoint: () => ({ x: 5, y: 5 }),
  displayNearest: () => display,
})

describe('dock logging', () => {
  it('should log the cursor and the chosen display when resolving the display', () => {
    const { lines, logger } = recordingLogger()
    const display = { id: '1', bounds: area, workArea: area, source: 'electron' as const }
    const screen = logScreen(sourcedScreen(display), logger)

    screen.displayNearest(screen.cursorPoint())

    expect(lines).toEqual(['dock cursor', 'dock display'])
  })

  it('should log the bounds, the scale and the source of the work area when resolving the display', () => {
    const { contexts, logger } = recordingLogger()
    const workArea = { x: 0, y: 21, width: 1280, height: 699 }
    const bounds = { x: 0, y: 0, width: 1280, height: 720 }
    const display = { id: '1', bounds, workArea, scaleFactor: 1.5, source: 'gtk' as const }
    const screen = logScreen(sourcedScreen(display), logger)

    screen.displayNearest({ x: 5, y: 5 })

    expect(contexts).toEqual([{ id: '1', bounds, scaleFactor: 1.5, workArea, source: 'gtk' }])
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
