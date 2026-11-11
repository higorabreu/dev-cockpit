export interface GlobalShortcuts {
  register(accelerator: string, handler: () => void): boolean
  unregister(accelerator: string): void
}
