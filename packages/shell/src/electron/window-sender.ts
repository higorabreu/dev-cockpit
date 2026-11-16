export interface SendableWindow {
  isDestroyed(): boolean
  readonly webContents: {
    isDestroyed(): boolean
    send(channel: string, ...args: unknown[]): void
  }
}

export type WindowSend = (channel: string, ...args: unknown[]) => void

// On shutdown a PTY or the daemon can still push after Electron destroyed the window, where send throws
export function createWindowSender(window: SendableWindow): WindowSend {
  return (channel, ...args) => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(channel, ...args)
  }
}
