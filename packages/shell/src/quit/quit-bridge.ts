import { hostChannels } from '@dck/core'
import { z } from 'zod'
import type { IpcMainApi } from '../electron/host-bridge.ts'
import type { QuitFiles } from './quit-files.ts'
import type { QuitGuard } from './quit-guard.ts'

const answerSchema = z.boolean()
const filesSchema = z.enum(['quit', 'stay', 'asking'])

export interface QuitBridgeOptions {
  readonly ipcMain: IpcMainApi
  readonly guard: Pick<QuitGuard, 'answer'>
  readonly files: Pick<QuitFiles, 'answer'>
}

// The window's answers to the quit card and about its open files; anything unexpected keeps the cockpit
// open
export function registerQuitBridge(options: QuitBridgeOptions) {
  options.ipcMain.on(hostChannels.quitAnswer, (_event, quit: unknown) => {
    const parsed = answerSchema.safeParse(quit)
    options.guard.answer(parsed.success && parsed.data)
  })
  options.ipcMain.on(hostChannels.quitFilesSettled, (_event, answer: unknown) => {
    const parsed = filesSchema.safeParse(answer)
    options.files.answer(parsed.success ? parsed.data : 'stay')
  })
}
