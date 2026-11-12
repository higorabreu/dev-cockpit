// Key registered in the system itself, which restores it on every login
export interface DesktopShortcut {
  // False when the key is invalid, already in use or the system refused it
  bind(accelerator: string): Promise<boolean>
}
