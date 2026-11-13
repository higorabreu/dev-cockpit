import { describe, expect, it } from 'vitest'
import { createWindowSender, type SendableWindow } from './window-sender.ts'

function fakeWindow() {
  const sent: unknown[][] = []
  const state = { window: false, contents: false }
  const window: SendableWindow = {
    isDestroyed: () => state.window,
    webContents: {
      isDestroyed: () => state.contents,
      send(channel, ...args) {
        if (state.window || state.contents) throw new TypeError('Object has been destroyed')
        sent.push([channel, ...args])
      },
    },
  }
  return { window, sent, state }
}

describe('createWindowSender', () => {
  it('should deliver the message when the window is alive', () => {
    const { window, sent } = fakeWindow()

    createWindowSender(window)('pty:data', 'tab-1', 'ls\r\n')

    expect(sent).toEqual([['pty:data', 'tab-1', 'ls\r\n']])
  })

  it('should drop the message without throwing when the window is destroyed', () => {
    const { window, sent, state } = fakeWindow()
    const send = createWindowSender(window)
    state.window = true

    expect(() => send('pty:data', 'tab-1', 'late')).not.toThrow()
    expect(sent).toEqual([])
  })

  it('should drop the message without throwing when only the page is destroyed', () => {
    const { window, sent, state } = fakeWindow()
    const send = createWindowSender(window)
    state.contents = true

    expect(() => send('views:changed', {})).not.toThrow()
    expect(sent).toEqual([])
  })
})
