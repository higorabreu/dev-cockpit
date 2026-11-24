import { describe, expect, it } from 'vitest'
import { parseThemeFile, themeFileSchema, themeKey } from './theme-file.ts'

describe('parseThemeFile', () => {
  it('should read every group as written when the file is valid', () => {
    const raw = {
      name: 'Dusk',
      type: 'light',
      colors: { bg: '#fafafa' },
      terminal: { red: '#aa0000' },
      syntax: { comment: '#5c5c5c' },
    }

    const { theme, issues } = parseThemeFile(raw, 'dusk')

    expect(theme).toEqual(raw)
    expect(issues).toEqual([])
  })

  it('should take the file name and the dark type when the file leaves them out', () => {
    const { theme, issues } = parseThemeFile({}, 'mine')

    expect(theme).toEqual({ name: 'mine', type: 'dark', colors: {}, terminal: {}, syntax: {} })
    expect(issues).toEqual([{ key: 'type', kind: 'missing' }])
  })

  it('should leave out and list each bad value when the file holds some', () => {
    const raw = {
      name: '  ',
      type: 'sepia',
      colors: { bg: '#101010', fg: 'white', glow: '#ffffff' },
      terminal: 'red',
      syntax: { comment: '#12345' },
      author: 'Ana',
    }

    const { theme, issues } = parseThemeFile(raw, 'broken')

    expect(theme).toEqual({
      name: 'broken',
      type: 'dark',
      colors: { bg: '#101010' },
      terminal: {},
      syntax: {},
    })
    expect(issues).toEqual([
      { key: 'author', kind: 'unknown', found: '"Ana"' },
      { key: 'name', kind: 'ignored', found: '"  "' },
      { key: 'type', kind: 'ignored', found: '"sepia"' },
      { key: 'colors.fg', kind: 'ignored', found: '"white"' },
      { key: 'colors.glow', kind: 'unknown', found: '"#ffffff"' },
      { key: 'terminal', kind: 'ignored', found: '"red"' },
      { key: 'syntax.comment', kind: 'ignored', found: '"#12345"' },
    ])
  })
})

describe('themeFileSchema', () => {
  it('should refuse a theme to write when a color is not a hex color', () => {
    const parsed = themeFileSchema.safeParse({
      name: 'Dusk',
      type: 'dark',
      colors: { bg: 'black' },
      terminal: {},
      syntax: {},
    })

    expect(parsed.success).toBe(false)
  })

  it('should refuse a theme to write when it names an unknown token', () => {
    const parsed = themeFileSchema.safeParse({
      name: 'Dusk',
      type: 'dark',
      colors: {},
      terminal: {},
      syntax: { glow: '#ffffff' },
    })

    expect(parsed.success).toBe(false)
  })
})

describe('themeKey', () => {
  it('should tell two themes of one name apart by their type', () => {
    expect(themeKey({ name: 'GitHub', type: 'dark' })).not.toBe(
      themeKey({ name: 'GitHub', type: 'light' }),
    )
  })
})
