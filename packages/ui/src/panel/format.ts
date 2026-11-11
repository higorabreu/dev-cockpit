import { agoParts, type Translator } from '@dck/core'

export function agoText(i18n: Translator, nowSeconds: number, thenSeconds: number): string {
  const { unit, value } = agoParts(nowSeconds, thenSeconds)
  return i18n.t(`ago.${unit}`, { value })
}
