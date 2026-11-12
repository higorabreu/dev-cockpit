import { agoParts, type Translator } from '@dck/core'

export function agoText(i18n: Translator, nowSeconds: number, thenSeconds: number): string {
  const { unit, value } = agoParts(nowSeconds, thenSeconds)
  return i18n.t(`ago.${unit}`, { value })
}

// Caminho com a pasta do usuário abreviada, como o shell mostra
export const displayPath = (path: string): string => path.replace(/^\/(?:home|Users)\/[^/]+/, '~')
