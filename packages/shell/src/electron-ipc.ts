import type { IpcMainApi } from './host-bridge.ts'

interface ElectronIpcMain {
  handle(channel: string, listener: never): void
  on(channel: string, listener: never): void
}

// Isola o tipo do Electron, que tem sobrecargas demais para servir de porta
export function createElectronIpc(ipcMain: ElectronIpcMain): IpcMainApi {
  return {
    handle: (channel, listener) => ipcMain.handle(channel, listener as never),
    on: (channel, listener) => ipcMain.on(channel, listener as never),
  }
}
