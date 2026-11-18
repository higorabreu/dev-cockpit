import { hostChannels } from '@dck/core'
import type { WindowSend } from '../electron/window-sender.ts'
import type { DockActions } from './dock-actions.ts'

// What brings the window up for something to show in it. Each presents it, so a visible window stays where
// it is instead of being hidden and mapped again, and the window hears of it only once it is up
export function createWindowRequests(actions: Pick<DockActions, 'present'>, send: WindowSend) {
  const presentThen = (channel: string, ...args: unknown[]) =>
    void actions.present().then(() => send(channel, ...args))
  return {
    notificationClick: (tabId: string) => presentThen(hostChannels.notificationsClick, tabId),
    askQuit: (running: number) => presentThen(hostChannels.quitAsk, running),
    openSettings: () => presentThen(hostChannels.windowOpenSettings),
    // Opening the app again, from the application menu, while it already runs
    reopen: () => void actions.present(),
  }
}
