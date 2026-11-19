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

// Code in the editor by role ("dck vivo, suave", chosen by the maintainer on 2026-11-19), mapped to Lezer's
// tags in ui/src/editor/editor-syntax.ts; a user theme can override each role
export interface SyntaxPalette {
  // Storage and declaration keywords (const, class, private, function)
  readonly storage: string
  // Control flow keywords (import, if, return, await) and a doc comment's tags
  readonly control: string
  readonly constant: string
  readonly type: string
  readonly function: string
  readonly string: string
  readonly number: string
  readonly property: string
  readonly variable: string
  readonly operator: string
  readonly punctuation: string
  readonly comment: string
  readonly invalid: string
  // Brackets by depth, repeating
  readonly bracket1: string
  readonly bracket2: string
  readonly bracket3: string
  // Decorative: a 1px line per indent level, not read as text
  readonly indentGuide: string
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
    // The editor's search: a quiet solid tint under every match, a stronger one under the current match
    readonly searchMatch: string
    readonly searchCurrent: string
  }
  readonly overlay: {
    readonly scroll: string
    readonly scrollHover: string
    readonly scrollActive: string
  }
  readonly syntax: SyntaxPalette
  readonly terminal: TerminalPalette
}

export interface Tokens {
  readonly themes: Readonly<Record<ThemeName, ThemeTokens>>
  readonly mix: {
    readonly sectorIdle: number
    readonly sectorSelected: number
    readonly listSelected: number
    // The fg share over a diff line's own tint when the line is selected for a comment
    readonly lineSelected: number
    // The fg share over the window color for a terminal selection, while the terminal has focus and without it
    readonly terminalSelection: number
    readonly terminalSelectionInactive: number
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
