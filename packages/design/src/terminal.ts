import type { TerminalPalette, ThemeName, Tokens } from './tokens.ts'

export interface TerminalTheme extends TerminalPalette {
  readonly foreground: string
  readonly cursor: string
  readonly selectionBackground: string
  readonly scrollbarSliderBackground: string
  readonly scrollbarSliderHoverBackground: string
  readonly scrollbarSliderActiveBackground: string
}

// O fundo fica a cargo da interface, que decide a opacidade da janela
export function buildTerminalTheme(tokens: Tokens, theme: ThemeName): TerminalTheme {
  const { color, overlay, terminal } = tokens.themes[theme]
  return {
    ...terminal,
    foreground: color.fg,
    cursor: color.fg,
    selectionBackground: overlay.selection,
    scrollbarSliderBackground: overlay.scroll,
    scrollbarSliderHoverBackground: overlay.scrollHover,
    scrollbarSliderActiveBackground: overlay.scrollActive,
  }
}
