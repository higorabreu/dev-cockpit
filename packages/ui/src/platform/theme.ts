import { buildTerminalTheme, type ThemeName, tokens } from '@dck/design'

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

export function applyTheme(name: ThemeName) {
  document.documentElement.dataset.theme = name
}

// xterm derives reverse video and OSC 11 replies from it; terminal.css leaves it unpainted for the opacity
export const terminalTheme = (name: ThemeName) => ({
  ...buildTerminalTheme(tokens, name),
  background: tokens.themes[name].color.bg,
})
