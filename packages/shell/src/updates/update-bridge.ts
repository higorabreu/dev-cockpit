import { hostChannels, type Logger, type Updater } from '@dck/core'
import type { IpcMainApi } from '../electron/host-bridge.ts'

export interface UpdateBridgeOptions {
  readonly ipcMain: IpcMainApi
  readonly updater: Updater
  // Opens the release page in the system browser
  openExternal(url: string): void
  // Relaunches the app and quits once the tabs are written
  restart(): Promise<void>
  readonly logger: Logger
}

// No channel reads what the window sends: the host knows the release, its page and its files
export function registerUpdateBridge(options: UpdateBridgeOptions) {
  const { ipcMain, updater, logger } = options
  ipcMain.handle(hostChannels.updatesState, () => updater.state())
  ipcMain.handle(hostChannels.updatesCheck, () => updater.check())
  ipcMain.on(hostChannels.updatesInstall, () => void updater.install())
  ipcMain.on(hostChannels.updatesDismiss, () => updater.dismiss())
  ipcMain.on(hostChannels.updatesOpenRelease, () => {
    const page = updater.releasePage()
    if (page) options.openExternal(page)
    else logger.warn('no release page to open')
  })
  ipcMain.on(hostChannels.updatesRestart, () => {
    logger.info('restart requested to finish the update')
    void options.restart()
  })
}
