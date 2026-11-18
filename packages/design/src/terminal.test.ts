import { describe, expect, it } from 'vitest'
import { formatHex, mix, parseHex } from './color.ts'
import { buildTerminalTheme } from './terminal.ts'
import { themeNames, tokens } from './tokens.ts'

describe('buildTerminalTheme', () => {
  it('should use the foreground token for text and cursor when building the dark theme', () => {
    const theme = buildTerminalTheme(tokens, 'dark')

    expect(theme.foreground).toBe(tokens.themes.dark.color.fg)
    expect(theme.cursor).toBe(tokens.themes.dark.color.fg)
  })

  it('should carry the sixteen ansi colors when building a theme', () => {
    const theme = buildTerminalTheme(tokens, 'light')

    expect(theme.red).toBe(tokens.themes.light.terminal.red)
    expect(theme.brightWhite).toBe(tokens.themes.light.terminal.brightWhite)
  })

  it('should map the scrollbar overlays to the xterm slider keys when building a theme', () => {
    const theme = buildTerminalTheme(tokens, 'dark')

    expect(theme.scrollbarSliderBackground).toBe(tokens.themes.dark.overlay.scroll)
    expect(theme.scrollbarSliderHoverBackground).toBe(tokens.themes.dark.overlay.scrollHover)
    expect(theme.scrollbarSliderActiveBackground).toBe(tokens.themes.dark.overlay.scrollActive)
  })

  it('should paint a solid selection mixed from the text and the window colors when building each theme', () => {
    for (const name of themeNames) {
      const { color } = tokens.themes[name]
      const mixed = (percent: number) =>
        formatHex(mix(parseHex(color.fg), parseHex(color.bg), percent / 100))

      const theme = buildTerminalTheme(tokens, name)

      expect(theme.selectionBackground).toBe(mixed(tokens.mix.terminalSelection))
      expect(theme.selectionInactiveBackground).toBe(mixed(tokens.mix.terminalSelectionInactive))
      expect(theme.selectionBackground).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('should draw the selected text in the primary text color when building a theme', () => {
    const theme = buildTerminalTheme(tokens, 'light')

    expect(theme.selectionForeground).toBe(tokens.themes.light.color.fg)
  })

  it('should leave the background to the interface when building a theme', () => {
    const theme = buildTerminalTheme(tokens, 'dark')

    expect('background' in theme).toBe(false)
  })
})
