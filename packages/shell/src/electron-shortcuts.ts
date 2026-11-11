import type { GlobalShortcuts } from '@dck/core'

export interface ShortcutApi {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

export function createElectronShortcuts(api: ShortcutApi): GlobalShortcuts {
  return {
    register: (accelerator, handler) => api.register(accelerator, handler),
    unregister: (accelerator) => api.unregister(accelerator),
  }
}
