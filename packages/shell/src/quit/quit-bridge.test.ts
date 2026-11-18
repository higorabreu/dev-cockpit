import { hostChannels } from '@dck/core'
import { describe, expect, it } from 'vitest'
import type { IpcMainApi } from '../electron/host-bridge.ts'
import { registerQuitBridge } from './quit-bridge.ts'

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain: IpcMainApi = {
    handle: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
    on: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
  }
  const answers: boolean[] = []
  registerQuitBridge({ ipcMain, guard: { answer: (quit) => void answers.push(quit) } })
  const send = (...args: unknown[]) => handlers.get(hostChannels.quitAnswer)?.({}, ...args)
  return { send, answers }
}

describe('registerQuitBridge', () => {
  it('should pass the window answer to the guard when it is a boolean', () => {
    const { send, answers } = setup()

    send(true)
    send(false)

    expect(answers).toEqual([true, false])
  })

  it('should keep the cockpit open when the answer is not a boolean', () => {
    const { send, answers } = setup()

    send('yes')
    send(1)

    expect(answers).toEqual([false, false])
  })
})
