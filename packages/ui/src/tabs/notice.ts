import type { Translator } from '@dck/core'

const VISIBLE_MS = 1800

// The notice takes a fixed spot at the end of the tab bar and disappears when empty, covering no tab. A
// lasting notice (an update) stays until replaced; a copy shows over it for a moment and gives it back
export function createNotice(element: HTMLElement, i18n: Translator) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let lasting: readonly Node[] = []

  function showLasting() {
    timer = undefined
    element.classList.toggle('lasting', lasting.length > 0)
    element.replaceChildren(...lasting)
  }

  return {
    copied(text: string) {
      const count = text.length
      const label = document.createElement('span')
      const amount = document.createElement('span')
      label.textContent = i18n.t('notice.copied')
      amount.className = 'notice-count'
      amount.textContent = i18n.plural('notice.chars', count)
      element.classList.remove('lasting')
      element.replaceChildren(label, amount)
      clearTimeout(timer)
      timer = setTimeout(showLasting, VISIBLE_MS)
    },
    // Empty clears it; while a copy shows, it takes its place when the copy goes
    setLasting(nodes: readonly Node[]) {
      lasting = nodes
      if (timer === undefined) showLasting()
    },
  }
}

export type Notice = ReturnType<typeof createNotice>
