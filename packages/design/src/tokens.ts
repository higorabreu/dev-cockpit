import tokensJson from '../tokens.json' with { type: 'json' }

export type ThemeName = 'dark' | 'light'

export interface TerminalPalette {
  readonly black: string
  readonly red: string
  readonly green: string
  readonly yellow: string
  readonly blue: string
  readonly magenta: string
  readonly cyan: string
  readonly white: string
  readonly brightBlack: string
  readonly brightRed: string
  readonly brightGreen: string
  readonly brightYellow: string
  readonly brightBlue: string
  readonly brightMagenta: string
  readonly brightCyan: string
  readonly brightWhite: string
}

export interface ThemeTokens {
  readonly color: {
    readonly bg: string
    readonly surface: string
    readonly line: string
    readonly controlLine: string
    readonly fg: string
    readonly muted: string
    readonly tabActive: string
    readonly accent: string
    readonly accentInk: string
    readonly success: string
    readonly warning: string
    readonly critical: string
    // Added and removed lines of a diff, the changed words inside them, and their numbers and signs
    readonly diffAdd: string
    readonly diffAddWord: string
    readonly diffAddInk: string
    readonly diffRemove: string
    readonly diffRemoveWord: string
    readonly diffRemoveInk: string
  }
  readonly overlay: {
    readonly selection: string
    readonly scroll: string
    readonly scrollHover: string
    readonly scrollActive: string
  }
  readonly terminal: TerminalPalette
}

export interface Tokens {
  readonly themes: Readonly<Record<ThemeName, ThemeTokens>>
  readonly mix: {
    readonly sectorIdle: number
    readonly sectorSelected: number
    readonly listSelected: number
    readonly iconIdle: number
  }
  readonly font: { readonly sans: string; readonly mono: string }
  readonly size: {
    readonly terminal: number
    readonly scrollbar: number
    readonly scrollbarThumb: number
  }
  readonly radius: { readonly small: string; readonly medium: string; readonly large: string }
  readonly motion: { readonly fast: string; readonly normal: string; readonly easing: string }
}

export const tokens: Tokens = tokensJson
export const themeNames: readonly ThemeName[] = ['dark', 'light']
