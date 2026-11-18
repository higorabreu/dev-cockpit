import { formatHex, mix, parseHex } from './color.ts'
import type { TerminalPalette, ThemeName, Tokens } from './tokens.ts'

export interface TerminalTheme extends TerminalPalette {
  readonly foreground: string
  readonly cursor: string
  readonly selectionBackground: string
  readonly selectionInactiveBackground: string
  readonly selectionForeground: string
  readonly scrollbarSliderBackground: string
  readonly scrollbarSliderHoverBackground: string
  readonly scrollbarSliderActiveBackground: string
}

// Solid, because xterm blends a translucent selection over its transparent background as if it were black
// (a black bar in light); the text turns primary so every program color stays readable on it
export function terminalSelection(tokens: Tokens, theme: ThemeName, focused: boolean): string {
  const { color } = tokens.themes[theme]
  const share = focused ? tokens.mix.terminalSelection : tokens.mix.terminalSelectionInactive
  return formatHex(mix(parseHex(color.fg), parseHex(color.bg), share / 100))
}

// The background is left to the interface, which decides the window opacity
export function buildTerminalTheme(tokens: Tokens, theme: ThemeName): TerminalTheme {
  const { color, overlay, terminal } = tokens.themes[theme]
  return {
    ...terminal,
    foreground: color.fg,
    cursor: color.fg,
    selectionBackground: terminalSelection(tokens, theme, true),
    selectionInactiveBackground: terminalSelection(tokens, theme, false),
    selectionForeground: color.fg,
    scrollbarSliderBackground: overlay.scroll,
    scrollbarSliderHoverBackground: overlay.scrollHover,
    scrollbarSliderActiveBackground: overlay.scrollActive,
  }
}
