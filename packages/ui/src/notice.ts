import type { Translator } from '@dck/core'

const VISIBLE_MS = 1800

// The notice takes a fixed spot at the end of the tab bar and disappears when empty, covering no tab
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
