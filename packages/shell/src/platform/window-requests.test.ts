import { createDockController, hostChannels } from '@dck/core'
import { FakeDockWindow, FakeScheduler, FakeScreen } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { createDockActions } from './dock-actions.ts'
import { createWindowRequests } from './window-requests.ts'

const monitor = { x: 0, y: 0, width: 1600, height: 900 }

function setup(visible: boolean) {
  const window = new FakeDockWindow()
  const screen = new FakeScreen([{ id: '1', bounds: monitor, workArea: monitor }], { x: 0, y: 0 })
  const dock = createDockController({ screen, window, scheduler: new FakeScheduler() })
  if (visible) {
    dock.show()
    window.blur()
  }
  const callsBefore = window.calls.length
  const sent: Array<{ channel: string; args: unknown[]; visible: boolean }> = []
  const requests = createWindowRequests(createDockActions(dock), (channel, ...args) =>
    sent.push({ channel, args, visible: window.isVisible() }),
  )
  return { window, sent, requests, windowCalls: () => window.calls.slice(callsBefore) }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const paths = [
  {
    name: 'a notification is clicked',
    run: (requests: ReturnType<typeof setup>['requests']) => requests.notificationClick('tab-3'),
    channel: hostChannels.notificationsClick,
    args: ['tab-3'],
  },
  {
    name: 'a quit asks first',
    run: (requests: ReturnType<typeof setup>['requests']) => requests.askQuit(2),
    channel: hostChannels.quitAsk,
    args: [2],
  },
  {
    name: 'settings are opened from a menu',
    run: (requests: ReturnType<typeof setup>['requests']) => requests.openSettings(),
    channel: hostChannels.windowOpenSettings,
    args: [],
  },
]

describe('createWindowRequests', () => {
  for (const path of paths) {
    it(`should focus a visible window in place and then tell it when ${path.name}`, async () => {
      const { window, sent, requests, windowCalls } = setup(true)

      path.run(requests)
      await flush()

      expect(windowCalls()).toEqual(['focus'])
      expect(window.isFocused()).toBe(true)
      expect(sent).toEqual([{ channel: path.channel, args: path.args, visible: true }])
    })

    it(`should show a hidden window before telling it when ${path.name}`, async () => {
      const { window, sent, requests } = setup(false)

      path.run(requests)
      await flush()

      expect(window.isVisible()).toBe(true)
      expect(sent).toEqual([{ channel: path.channel, args: path.args, visible: true }])
    })
  }

  it('should focus a visible window in place when the app is opened again', async () => {
    const { requests, windowCalls } = setup(true)

    requests.reopen()
    await flush()

    expect(windowCalls()).toEqual(['focus'])
  })

  it('should show a hidden window when the app is opened again', async () => {
    const { window, requests } = setup(false)

    requests.reopen()
    await flush()

    expect(window.isVisible()).toBe(true)
  })
})
