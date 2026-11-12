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

// The background is transparent: the page body paints it, with the window opacity
export const terminalTheme = (name: ThemeName) => ({
  background: 'rgba(0, 0, 0, 0)',
  ...buildTerminalTheme(tokens, name),
})
