import type { GlobalShortcuts } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createToggleKeyBinder } from './toggle-key-binder.ts'

function fakeElectron(taken: readonly string[] = []) {
  const active = new Set<string>()
  const api: GlobalShortcuts = {
    register(key) {
      if (taken.includes(key)) return false
      active.add(key)
      return true
    },
    unregister: (key) => void active.delete(key),
  }
  return { api, active }
}

const binderOf = (parts: {
  electron: GlobalShortcuts
  desktop?: { bind(key: string): Promise<boolean> }
}) => createToggleKeyBinder({ ...parts, onToggle: () => {}, onInvalid: () => {} })

describe('createToggleKeyBinder', () => {
  it('should use only the desktop shortcut when one is available', async () => {
    const electron = fakeElectron()
    const binder = binderOf({ electron: electron.api, desktop: { bind: async () => true } })

    const bound = await binder.bind('F12')

    expect(bound).toBe(true)
    expect(electron.active.size).toBe(0)
  })

  it('should refuse when the desktop shortcut is refused', async () => {
    const electron = fakeElectron()
    const binder = binderOf({ electron: electron.api, desktop: { bind: async () => false } })

    const bound = await binder.bind('F12')

    expect(bound).toBe(false)
    expect(electron.active.size).toBe(0)
  })

  it('should register through electron when there is no desktop shortcut', async () => {
    const electron = fakeElectron()
    const binder = binderOf({ electron: electron.api })

    const bound = await binder.bind('F9')

    expect(bound).toBe(true)
    expect([...electron.active]).toEqual(['F9'])
  })

  it('should keep the previous key when electron refuses the new one', async () => {
    const electron = fakeElectron(['F12'])
    const binder = binderOf({ electron: electron.api })
    await binder.bind('F9')

    const bound = await binder.bind('F12')

    expect(bound).toBe(false)
    expect([...electron.active]).toEqual(['F9'])
  })

  it('should refuse without throwing when electron rejects a malformed accelerator', async () => {
    const electron: GlobalShortcuts = {
      register: () => {
        throw new Error('bad accelerator')
      },
      unregister: () => {},
    }
    const binder = binderOf({ electron })

    const bound = await binder.bind('???')

    expect(bound).toBe(false)
  })

  it('should unregister the electron key when released', async () => {
    const electron = fakeElectron()
    const binder = binderOf({ electron: electron.api })
    await binder.bind('F9')

    binder.release()

    expect(electron.active.size).toBe(0)
  })
})
