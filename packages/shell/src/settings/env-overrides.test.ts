import { defaultSettings } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { applyEnvOverrides } from './env-overrides.ts'

describe('applyEnvOverrides', () => {
  it('should leave the settings alone and lock nothing when no variable is set', () => {
    const result = applyEnvOverrides(defaultSettings, {})

    expect(result.settings).toEqual(defaultSettings)
    expect(result.locked).toEqual([])
  })

  it('should override the three settings and lock them when their variables are set', () => {
    const result = applyEnvOverrides(defaultSettings, {
      DCK_KEY: 'F8',
      DCK_HEIGHT: '0.7',
      DCK_PROJECTS_ROOT: '/work',
    })

    expect(result.settings.shortcuts.toggleWindow).toBe('F8')
    expect(result.settings.window.heightRatio).toBe(0.7)
    expect(result.settings.projects.root).toBe('/work')
    expect([...result.locked].sort()).toEqual([
      'projects.root',
      'shortcuts.toggleWindow',
      'window.heightRatio',
    ])
  })

  it('should ignore a height that is not a number when the variable is malformed', () => {
    const result = applyEnvOverrides(defaultSettings, { DCK_HEIGHT: 'tall' })

    expect(result.settings.window.heightRatio).toBe(0.5)
    expect(result.locked).toEqual([])
  })
})
