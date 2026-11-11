import type { MessageKey, Translator } from '@dck/core'

// Os textos do index.html (rótulos de acessibilidade e placeholders) trazem a chave no atributo
// `data-i18n-aria`, `data-i18n-tip` ou `data-i18n-placeholder` e são preenchidos na língua do usuário ao abrir
export function translateStatic(i18n: Translator, root: ParentNode = document) {
  document.documentElement.lang = i18n.locale
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    element.setAttribute('aria-label', i18n.t(element.dataset.i18nAria as MessageKey))
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-tip]')) {
    element.setAttribute('data-tip', i18n.t(element.dataset.i18nTip as MessageKey))
  }
  for (const element of root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    element.placeholder = i18n.t(element.dataset.i18nPlaceholder as MessageKey)
  }
}
