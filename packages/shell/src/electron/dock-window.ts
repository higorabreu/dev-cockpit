import type { DockWindow, Rectangle } from '@dck/core'

export interface WindowApi {
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
}

export function createElectronDockWindow(
  window: WindowApi,
  hooks: DockWindowHooks = {},
): DockWindow {
  return {
    isVisible: () => window.isVisible(),
    isFocused: () => window.isFocused(),
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
