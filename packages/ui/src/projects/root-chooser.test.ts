import { defaultSettings, mergeSettings, type Settings, type SettingsPatch } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createRootChooser } from './root-chooser.ts'

function memorySettings(initial: Settings = defaultSettings) {
  let current = initial
  const patches: SettingsPatch[] = []
  return {
    patches,
    current: () => current,
    async update(patch: SettingsPatch) {
      patches.push(patch)
      current = mergeSettings(current, patch)
      return { settings: current, locked: [], fresh: false, rejected: [] }
    },
  }
}

describe('createRootChooser', () => {
  it('should need a folder when the projects folder was never chosen', () => {
    const chooser = createRootChooser({ pick: async () => undefined, settings: memorySettings() })

    expect(chooser.needed()).toBe(true)
  })

  it('should save the picked folder in the settings when the user chooses one', async () => {
    const settings = memorySettings()
    const chooser = createRootChooser({ pick: async () => '/home/ana/work', settings })

    const saved = await chooser.choose()

    expect(saved).toBe(true)
    expect(settings.patches).toEqual([{ projects: { root: '/home/ana/work' } }])
    expect(settings.current().projects.root).toBe('/home/ana/work')
    expect(chooser.needed()).toBe(false)
  })

  it('should leave the projects folder unset when the user cancels the picker', async () => {
    const settings = memorySettings()
    const chooser = createRootChooser({ pick: async () => undefined, settings })

    const saved = await chooser.choose()

    expect(saved).toBe(false)
    expect(settings.patches).toEqual([])
    expect(settings.current().projects.root).toBeNull()
  })
})
