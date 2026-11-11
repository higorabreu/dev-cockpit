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

// Mostra onde a janela realmente ficou depois de mostrar, para comparar com o que foi pedido
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
