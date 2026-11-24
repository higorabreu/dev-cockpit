import {
  buildTerminalTheme,
  type ThemeName,
  type ThemeTokens,
  themeVariables,
  tokens,
  withTheme,
} from '@dck/design'

export type ThemeSetting = ThemeName | 'system'

// "System" follows the desktop preference; the other two are fixed
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ThemeName {
  if (setting === 'system') return prefersDark ? 'dark' : 'light'
  return setting
}

const darkQuery = () => matchMedia('(prefers-color-scheme: dark)')

export const themeFor = (setting: ThemeSetting): ThemeName =>
  resolveTheme(setting, darkQuery().matches)

// Notifies when the desktop switches between light and dark; the caller decides whether that matters
export function watchSystemTheme(onChange: () => void): () => void {
  const query = darkQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

// The stylesheet holds dck's own colors for the first paint; the theme in use goes on the root over them, so
// the interface and CodeMirror, which read the same variables, change at once
export function applyTheme(type: ThemeName, theme: ThemeTokens = tokens.themes[type]) {
  const root = document.documentElement
  root.dataset.theme = type
  for (const [name, value] of themeVariables(withTheme(tokens, type, theme), type))
    root.style.setProperty(name, value)
}

// xterm derives reverse video and OSC 11 replies from it; terminal.css leaves it unpainted for the opacity
export const terminalTheme = (type: ThemeName, theme: ThemeTokens = tokens.themes[type]) => ({
  ...buildTerminalTheme(withTheme(tokens, type, theme), type),
  background: theme.color.bg,
  // xterm draws the letter under a block cursor in black unless told otherwise, unreadable in light
  cursorAccent: theme.color.bg,
})

export type TerminalColors = ReturnType<typeof terminalTheme>
