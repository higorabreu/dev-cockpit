import type { DockWindow, Rectangle } from '@dck/core'

export interface WindowApi {
  on(event: 'blur', listener: () => void): void
  isVisible(): boolean
  isFocused(): boolean
  getBounds(): Rectangle
  setBounds(bounds: Rectangle): void
  show(): void
  hide(): void
  focus(): void
}

export interface DockWindowHooks {
  readonly onShown?: () => void
  readonly now?: () => number
}

// The desktop can take the focus for an instant while it runs the shortcut that asks to hide the window
const FOCUS_GRACE_MS = 400

export function createElectronDockWindow(
  window: WindowApi,
  hooks: DockWindowHooks = {},
): DockWindow {
  const now = hooks.now ?? Date.now
  let blurredAt = Number.NEGATIVE_INFINITY
  window.on('blur', () => {
    blurredAt = now()
  })
  return {
    isVisible: () => window.isVisible(),
    isFocused: () => window.isFocused() || now() - blurredAt < FOCUS_GRACE_MS,
    bounds: () => window.getBounds(),
    setBounds: (bounds) => window.setBounds(bounds),
    show() {
      window.show()
      hooks.onShown?.()
    },
    hide: () => window.hide(),
    focus: () => window.focus(),
  }
}
