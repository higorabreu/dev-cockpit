import type { Translator } from '@dck/core'

const VISIBLE_MS = 1800

// O aviso fica na mesma linha da barra de abas, centralizado verticalmente com ela
export function createNotice(element: HTMLElement, bar: HTMLElement, i18n: Translator) {
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
      const box = bar.getBoundingClientRect()
      element.style.top = `${Math.round(box.top + (box.height - element.offsetHeight) / 2)}px`
      element.classList.add('show')
      clearTimeout(timer)
      timer = setTimeout(() => element.classList.remove('show'), VISIBLE_MS)
    },
  }
}
