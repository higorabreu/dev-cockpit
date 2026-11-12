import type { IpcMainApi } from './host-bridge.ts'

interface ElectronIpcMain {
  handle(channel: string, listener: never): void
  on(channel: string, listener: never): void
}

// Isolates the Electron type, which has too many overloads to serve as a port
export function createElectronIpc(ipcMain: ElectronIpcMain): IpcMainApi {
  return {
    handle: (channel, listener) => ipcMain.handle(channel, listener as never),
    on: (channel, listener) => ipcMain.on(channel, listener as never),
  }
}
