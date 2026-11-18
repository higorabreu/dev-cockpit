import { hostChannels } from '@dck/core'
import { describe, expect, it } from 'vitest'
import type { IpcMainApi } from '../electron/host-bridge.ts'
import { registerAboutBridge } from './about-bridge.ts'

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain: IpcMainApi = {
    handle: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
    on: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
  }
  const opened: string[] = []
  registerAboutBridge({
    ipcMain,
    repository: 'acme/cockpit',
    version: '1.2.3',
    openExternal: (url) => void opened.push(url),
  })
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)?.({}, ...args)
  return { call, opened }
}

describe('registerAboutBridge', () => {
  it('should answer the version that runs', () => {
    expect(setup().call(hostChannels.aboutVersion)).toBe('1.2.3')
  })

  it('should open the page of a named link and nothing for an address or an unknown name', () => {
    // Arrange
    const { call, opened } = setup()

    // Act
    call(hostChannels.aboutOpen, 'releaseNotes')
    call(hostChannels.aboutOpen, 'https://attacker.example.com')
    call(hostChannels.aboutOpen, 'settings')

    // Assert
    expect(opened).toEqual(['https://github.com/acme/cockpit/releases/tag/v1.2.3'])
  })
})
