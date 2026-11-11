import { buildTerminalTheme, type ThemeName, tokens } from '@dck/design'

const storageKey = 'dck-theme'

export function currentTheme(): ThemeName {
  const stored = localStorage.getItem(storageKey)
  return stored === 'light' ? 'light' : 'dark'
}

export function applyTheme(name: ThemeName) {
  localStorage.setItem(storageKey, name)
  document.documentElement.dataset.theme = name
}

// O fundo é transparente: quem pinta é o corpo da página, com a opacidade da janela
export const terminalTheme = (name: ThemeName) => ({
  background: 'rgba(0, 0, 0, 0)',
  ...buildTerminalTheme(tokens, name),
})
