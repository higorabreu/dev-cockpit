import type { DockController } from '@dck/core'
import type { WaylandArea } from './linux/wayland-bounds.ts'

export interface DockActions {
  toggle(): Promise<void>
  show(): Promise<void>
  present(): Promise<void>
  // Resolves to the anchored height to save when leaving full height changed it (DockController)
  toggleFullHeight(): Promise<number | undefined>
}

// Under native Wayland, a show that skips the compositor covers the monitor and slides under the top bar
export function createDockActions(dock: DockController, area?: WaylandArea): DockActions {
  const beforeShow = async () => {
    await area?.refresh()
  }
  return {
    toggle: () => beforeShow().then(() => dock.toggle()),
    show: () => beforeShow().then(() => dock.show()),
    present: () => beforeShow().then(() => dock.present()),
    async toggleFullHeight() {
      if (area && !area.current()) await beforeShow()
      return dock.toggleFullHeight()
    },
  }
}
