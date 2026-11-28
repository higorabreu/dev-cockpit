import { describe, expect, it } from 'vitest'
import { createLoginItemAutostart, type LoginItems } from './login-item-autostart.ts'

// The Run key Electron keeps, by program and arguments
function fakeLoginItems() {
  const entries = new Map<string, boolean>()
  const keyOf = (path: string, args: readonly string[]) => [path, ...args].join(' ')
  const items: LoginItems = {
    getLoginItemSettings: ({ path, args }) => ({
      openAtLogin: entries.get(keyOf(path, args)) ?? false,
    }),
    setLoginItemSettings: ({ openAtLogin, path, args }) => {
      entries.set(keyOf(path, args), openAtLogin)
    },
  }
  return { items, entries }
}

const command = ['C:\\Users\\ana\\AppData\\Local\\Programs\\Dev Cockpit\\Dev Cockpit.exe']

describe('createLoginItemAutostart', () => {
  it('should be off when the cockpit was never set to start with Windows', async () => {
    const { items } = fakeLoginItems()

    const enabled = await createLoginItemAutostart(items, command).isEnabled()

    expect(enabled).toBe(false)
  })

  it('should start the cockpit hidden with Windows when turned on', async () => {
    const { items, entries } = fakeLoginItems()
    const autostart = createLoginItemAutostart(items, command)

    await autostart.setEnabled(true)

    expect(await autostart.isEnabled()).toBe(true)
    expect([...entries.keys()]).toEqual([`${command[0]} --start-hidden`])
  })

  it('should give the app folder before the flag when a development run is turned on', async () => {
    const { items, entries } = fakeLoginItems()

    await createLoginItemAutostart(items, [
      'C:\\electron.exe',
      'E:\\dck\\packages\\shell',
    ]).setEnabled(true)

    expect([...entries.keys()]).toEqual([
      'C:\\electron.exe E:\\dck\\packages\\shell --start-hidden',
    ])
  })

  it('should stop starting with Windows when turned off', async () => {
    const { items } = fakeLoginItems()
    const autostart = createLoginItemAutostart(items, command)
    await autostart.setEnabled(true)

    await autostart.setEnabled(false)

    expect(await autostart.isEnabled()).toBe(false)
  })
})
