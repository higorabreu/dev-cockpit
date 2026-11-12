import type { DockWindow, Logger, Screen } from '@dck/core'

const SETTLE_MS = 400

export function logScreen(screen: Screen, logger: Logger): Screen {
  return {
    cursorPoint() {
      const point = screen.cursorPoint()
      logger.info('dock cursor', { ...point })
      return point
    },
    displayNearest(point) {
      const display = screen.displayNearest(point)
      logger.info('dock display', { id: display.id, workArea: display.workArea })
      return display
    },
  }
}

// Shows where the window actually ended up after showing, to compare with what was requested
export function logDockWindow(window: DockWindow, logger: Logger): DockWindow {
  return {
    ...window,
    setBounds(bounds) {
      logger.info('dock setBounds', { ...bounds })
      window.setBounds(bounds)
    },
    show() {
      window.show()
      logger.info('dock after show', { ...window.bounds() })
      setTimeout(() => logger.info('dock settled', { ...window.bounds() }), SETTLE_MS)
    },
  }
}
