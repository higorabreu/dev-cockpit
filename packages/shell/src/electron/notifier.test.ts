import { describe, expect, it } from 'vitest'
import { createElectronNotifier, type NotificationHandle } from './notifier.ts'

function setup(supported = true) {
  const created: Array<{ title: string; body: string }> = []
  const handlers = new Map<string, () => void>()
  let shown = 0
  const clicked: string[] = []
  const handle: NotificationHandle = {
    on: (event, listener) => void handlers.set(event, listener),
    show: () => {
      shown += 1
    },
  }
  const notifier = createElectronNotifier(
    {
      isSupported: () => supported,
      create: (options) => {
        created.push(options)
        return handle
      },
    },
    (tabId) => clicked.push(tabId),
  )
  return { notifier, created, handlers, clicked, shown: () => shown }
}

describe('createElectronNotifier', () => {
  it('should show a notification with the title and body when notifying', () => {
    const { notifier, created, shown } = setup()

    notifier.notify({ title: 'Dev Cockpit', body: 'frontend: pnpm terminou', tabId: 'tab-3' })

    expect(created).toEqual([{ title: 'Dev Cockpit', body: 'frontend: pnpm terminou' }])
    expect(shown()).toBe(1)
  })

  it('should report the tab when the notification is clicked', () => {
    const { notifier, handlers, clicked } = setup()
    notifier.notify({ title: 't', body: 'b', tabId: 'tab-3' })

    handlers.get('click')?.()

    expect(clicked).toEqual(['tab-3'])
  })

  it('should show nothing when the system does not support notifications', () => {
    const { notifier, created } = setup(false)

    notifier.notify({ title: 't', body: 'b', tabId: 'tab-3' })

    expect(created).toEqual([])
  })
})
