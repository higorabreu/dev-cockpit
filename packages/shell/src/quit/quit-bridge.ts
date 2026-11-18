import { hostChannels } from '@dck/core'
import { z } from 'zod'
import type { IpcMainApi } from '../electron/host-bridge.ts'
import type { QuitGuard } from './quit-guard.ts'

const answerSchema = z.boolean()

export interface QuitBridgeOptions {
  readonly ipcMain: IpcMainApi
  readonly guard: Pick<QuitGuard, 'answer'>
}

// The window's answer to the quit card; anything but true keeps the cockpit open
export function registerQuitBridge(options: QuitBridgeOptions) {
  options.ipcMain.on(hostChannels.quitAnswer, (_event, quit: unknown) => {
    const parsed = answerSchema.safeParse(quit)
    options.guard.answer(parsed.success && parsed.data)
  })
}
