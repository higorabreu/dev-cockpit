import type { Autostart } from '@dck/core'

// Electron's app: on Windows it writes the Run key of the user's registry, so nothing needs a file of ours
export interface LoginItems {
  getLoginItemSettings(options: { path: string; args: string[] }): { openAtLogin: boolean }
  setLoginItemSettings(settings: { openAtLogin: boolean; path: string; args: string[] }): void
}

// A Run key entry carries arguments but no environment, so the hidden start is a flag (main.ts reads it)
export const START_HIDDEN_FLAG = '--start-hidden'

export function createLoginItemAutostart(items: LoginItems, command: readonly string[]): Autostart {
  const [path = '', ...rest] = command
  const args = [...rest, START_HIDDEN_FLAG]
  return {
    isEnabled: async () => items.getLoginItemSettings({ path, args }).openAtLogin,
    setEnabled: async (enabled) => items.setLoginItemSettings({ openAtLogin: enabled, path, args }),
  }
}
