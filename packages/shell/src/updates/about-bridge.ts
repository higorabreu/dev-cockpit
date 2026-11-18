import { ABOUT_LINKS, aboutUrl, hostChannels } from '@dck/core'
import { z } from 'zod'
import type { IpcMainApi } from '../electron/host-bridge.ts'

const linkSchema = z.enum(ABOUT_LINKS)

export interface AboutBridgeOptions {
  readonly ipcMain: IpcMainApi
  // owner/name on GitHub
  readonly repository: string
  readonly version: string
  openExternal(url: string): void
}

// The window names a link; only the cockpit's own pages can be opened from here
export function registerAboutBridge(options: AboutBridgeOptions) {
  const { ipcMain, repository, version } = options
  ipcMain.handle(hostChannels.aboutVersion, () => version)
  ipcMain.on(hostChannels.aboutOpen, (_event, link: unknown) => {
    const parsed = linkSchema.safeParse(link)
    if (parsed.success) options.openExternal(aboutUrl(repository, version, parsed.data))
  })
}
