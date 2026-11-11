import { describe, expect, it } from 'vitest'
import { buildTerminalTheme } from './terminal.ts'
import { tokens } from './tokens.ts'

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

  it('should leave the background to the interface when building a theme', () => {
    const theme = buildTerminalTheme(tokens, 'dark')

    expect('background' in theme).toBe(false)
  })
})
