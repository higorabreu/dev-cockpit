import type { SyntaxPalette, TerminalPalette, ThemeName, ThemeTokens, Tokens } from './tokens.ts'

export type ThemeColors = ThemeTokens['color']

// Single colors over a theme: what a theme file or `colorCustomizations` sets, each group partial
export interface ThemeLayer {
  readonly colors?: Partial<ThemeColors>
  readonly terminal?: Partial<TerminalPalette>
  readonly syntax?: Partial<SyntaxPalette>
}

export interface ThemeDefinition extends ThemeLayer {
  readonly name: string
  readonly type: ThemeName
}

// dck's own colors for the type, then each layer in order; the scrollbar overlays follow the type
export function resolveTheme(
  tokens: Tokens,
  type: ThemeName,
  layers: readonly ThemeLayer[],
): ThemeTokens {
  const base = tokens.themes[type]
  return layers.reduce<ThemeTokens>(
    (theme, layer) => ({
      ...theme,
      color: { ...theme.color, ...layer.colors },
      terminal: { ...theme.terminal, ...layer.terminal },
      syntax: { ...theme.syntax, ...layer.syntax },
    }),
    base,
  )
}

// The tokens with one type's colors replaced, so the CSS, the terminal theme and the contrast checks read it
export const withTheme = (tokens: Tokens, type: ThemeName, theme: ThemeTokens): Tokens => ({
  ...tokens,
  themes: { ...tokens.themes, [type]: theme },
})
