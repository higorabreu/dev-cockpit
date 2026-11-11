import { buildTerminalTheme, type ThemeName, tokens } from '@dck/design'

export type ThemeSetting = ThemeName | 'system'

// "Do sistema" segue a preferência do desktop; as outras duas são fixas
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ThemeName {
  if (setting === 'system') return prefersDark ? 'dark' : 'light'
  return setting
}

const darkQuery = () => matchMedia('(prefers-color-scheme: dark)')

export const themeFor = (setting: ThemeSetting): ThemeName =>
  resolveTheme(setting, darkQuery().matches)

// Avisa quando o desktop troca entre claro e escuro; quem chama decide se isso importa
export function watchSystemTheme(onChange: () => void): () => void {
  const query = darkQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function applyTheme(name: ThemeName) {
  document.documentElement.dataset.theme = name
}

// O fundo é transparente: quem pinta é o corpo da página, com a opacidade da janela
export const terminalTheme = (name: ThemeName) => ({
  background: 'rgba(0, 0, 0, 0)',
  ...buildTerminalTheme(tokens, name),
})
