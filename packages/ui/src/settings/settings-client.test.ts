import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../platform/theme.ts'
import { legacyPatch } from './settings-client.ts'

const reader = (values: Record<string, string>) => (key: string) => values[key] ?? null

describe('legacyPatch', () => {
  it('should carry the old theme, opacity, font and language when they are stored', () => {
    const patch = legacyPatch(
      reader({
        'dck-theme': 'light',
        'dck-opacity': '0.8',
        'dck-font-size': '18',
        'dck-locale': 'en',
      }),
    )

    expect(patch).toEqual({ theme: 'light', opacity: 0.8, fontSize: 18, language: 'en' })
  })

  it('should carry nothing when nothing is stored', () => {
    expect(legacyPatch(reader({}))).toEqual({})
  })

  it('should skip values that are not usable when they are garbage', () => {
    const patch = legacyPatch(
      reader({ 'dck-theme': 'purple', 'dck-opacity': 'x', 'dck-locale': 'fr' }),
    )

    expect(patch).toEqual({})
  })
})

describe('resolveTheme', () => {
  it('should keep an explicit theme whatever the system prefers', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('should follow the system when the setting is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
