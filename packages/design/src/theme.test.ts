import { describe, expect, it } from 'vitest'
import { resolveTheme, withTheme } from './theme.ts'
import { tokens } from './tokens.ts'

describe('resolveTheme', () => {
  it("should be dck's own colors when no layer is given", () => {
    const theme = resolveTheme(tokens, 'light', [])

    expect(theme).toEqual(tokens.themes.light)
  })

  it('should take each layer over the base in order when layers set the same color', () => {
    const theme = resolveTheme(tokens, 'dark', [
      { colors: { bg: '#101010', fg: '#eeeeee' }, syntax: { comment: '#999999' } },
      { colors: { bg: '#121212' }, terminal: { red: '#ff8080' } },
    ])

    expect(theme.color.bg).toBe('#121212')
    expect(theme.color.fg).toBe('#eeeeee')
    expect(theme.syntax.comment).toBe('#999999')
    expect(theme.terminal.red).toBe('#ff8080')
    expect(theme.color.muted).toBe(tokens.themes.dark.color.muted)
  })

  it("should keep the type's scrollbar overlays when a layer recolors the theme", () => {
    const theme = resolveTheme(tokens, 'light', [{ colors: { bg: '#202020' } }])

    expect(theme.overlay).toEqual(tokens.themes.light.overlay)
  })
})

describe('withTheme', () => {
  it('should replace only the given type when building tokens for a resolved theme', () => {
    const theme = resolveTheme(tokens, 'dark', [{ colors: { bg: '#101010' } }])

    const result = withTheme(tokens, 'dark', theme)

    expect(result.themes.dark.color.bg).toBe('#101010')
    expect(result.themes.light).toBe(tokens.themes.light)
    expect(result.mix).toBe(tokens.mix)
  })
})
