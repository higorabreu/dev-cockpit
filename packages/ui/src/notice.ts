import type { Translator } from '@dck/core'

const VISIBLE_MS = 1800

// O aviso ocupa um lugar fixo no fim da barra de abas e some vazio, sem cobrir nenhuma aba
export function createNotice(element: HTMLElement, i18n: Translator) {
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    copied(text: string) {
      const count = text.length
      const label = document.createElement('span')
      const amount = document.createElement('span')
      label.textContent = i18n.t('notice.copied')
      amount.className = 'notice-count'
      amount.textContent = i18n.plural('notice.chars', count)
      element.replaceChildren(label, amount)
      clearTimeout(timer)
      timer = setTimeout(() => element.replaceChildren(), VISIBLE_MS)
    },
  }
}
