import { createUpdater, hostChannels, ok, silentLogger } from '@dck/core'
import { FakeReleaseSource, FakeScheduler } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import type { IpcMainApi } from '../electron/host-bridge.ts'
import { registerUpdateBridge } from './update-bridge.ts'

const PAGE = 'https://github.example.com/acme/backend/releases/tag/v0.10.0'

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain: IpcMainApi = {
    handle: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
    on: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
  }
  const opened: string[] = []
  let restarts = 0
  const updater = createUpdater({
    source: new FakeReleaseSource([ok({ version: '0.10.0', page: PAGE, assets: [] })]),
    installer: undefined,
    currentVersion: '0.9.0',
    arch: 'x64',
    mode: () => 'notify',
    scheduler: new FakeScheduler(),
    dismissed: { get: () => undefined, set() {} },
    logger: silentLogger,
    onChange() {},
  })
  registerUpdateBridge({
    ipcMain,
    updater,
    openExternal: (url) => void opened.push(url),
    restart: async () => {
      restarts += 1
    },
    logger: silentLogger,
  })
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)?.({}, ...args)
  return { call, opened, restarts: () => restarts }
}

describe('registerUpdateBridge', () => {
  it('should open the page of the release it found and ignore any address the window sends', async () => {
    const { call, opened } = setup()
    await call(hostChannels.updatesCheck)

    call(hostChannels.updatesOpenRelease, 'https://attacker.example.com')

    expect(opened).toEqual([PAGE])
  })

  it('should open nothing when no release was found', () => {
    const { call, opened } = setup()

    call(hostChannels.updatesOpenRelease)

    expect(opened).toEqual([])
  })

  it('should answer the state after a check when the window asks', async () => {
    const { call } = setup()

    const state = await call(hostChannels.updatesCheck)

    expect(state).toMatchObject({ notice: { kind: 'available', version: '0.10.0' } })
  })

  it('should restart once when the window asks', () => {
    const { call, restarts } = setup()

    call(hostChannels.updatesRestart)

    expect(restarts()).toBe(1)
  })
})
