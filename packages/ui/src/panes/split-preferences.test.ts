import { defaultSettings, mergeSettings, type Settings, type SettingsPatch } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createSplitPreferences, RATIO_SAVE_MS } from './split-preferences.ts'

function setup() {
  let settings: Settings = defaultSettings
  const patches: SettingsPatch[] = []
  const timers: { at: number; task: () => void; cancelled: boolean }[] = []
  let now = 0
  const store = createSplitPreferences({
    current: () => settings,
    update(patch) {
      patches.push(patch)
      settings = mergeSettings(settings, patch)
    },
    after(milliseconds, task) {
      const timer = { at: now + milliseconds, task, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  })
  const advance = (milliseconds: number) => {
    now += milliseconds
    for (const timer of timers.splice(0)) {
      if (timer.cancelled) continue
      if (timer.at <= now) timer.task()
      else timers.push(timer)
    }
  }
  return { store, patches, advance, settings: () => settings }
}

describe('createSplitPreferences', () => {
  it('should read the layout and both shares from the settings when nothing is pending', () => {
    const { store } = setup()

    expect(store.current()).toEqual({ preference: 'auto', ratios: { side: 0.5, stacked: 0.5 } })
  })

  it('should save the share once the divider rests when it moves many times', () => {
    const { store, patches, advance, settings } = setup()

    store.saveRatio('stacked', 0.4)
    advance(100)
    store.saveRatio('stacked', 0.35)
    const whileMoving = store.current().ratios.stacked
    advance(RATIO_SAVE_MS)

    expect(whileMoving).toBe(0.35)
    expect(patches).toEqual([{ review: { stackedRatio: 0.35 } }])
    expect(settings().review).toMatchObject({ stackedRatio: 0.35, sideRatio: 0.5 })
  })

  it('should keep each orientation its own share when both move before a save', () => {
    const { store, patches, advance } = setup()

    store.saveRatio('side', 0.6)
    store.saveRatio('stacked', 0.3)
    advance(RATIO_SAVE_MS)

    expect(patches).toEqual([{ review: { sideRatio: 0.6, stackedRatio: 0.3 } }])
  })

  it('should write the chosen layout only when it changes', () => {
    const { store, patches } = setup()

    store.setPreference('stacked')
    store.setPreference('stacked')

    expect(patches).toEqual([{ review: { layout: 'stacked' } }])
    expect(store.current().preference).toBe('stacked')
  })
})
