import type { Notifier } from '@dck/core'

export interface NotificationHandle {
  on(event: 'click' | 'close', listener: () => void): void
  show(): void
}

export interface NotificationApi {
  isSupported(): boolean
  create(options: { title: string; body: string }): NotificationHandle
}

export function createElectronNotifier(
  api: NotificationApi,
  onClick: (tabId: string) => void,
): Notifier {
  // Electron discards a notification with no reference before the click; keeps it until it closes
  const alive = new Set<NotificationHandle>()

  return {
    notify({ title, body, tabId }) {
      if (!api.isSupported()) return
      const handle = api.create({ title, body })
      alive.add(handle)
      handle.on('click', () => {
        alive.delete(handle)
        onClick(tabId)
      })
      handle.on('close', () => alive.delete(handle))
      handle.show()
    },
  }
}
