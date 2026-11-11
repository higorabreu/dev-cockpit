const VISIBLE_MS = 1800

// O aviso fica na mesma linha da barra de abas, centralizado verticalmente com ela
export function createNotice(element: HTMLElement, bar: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    copied(text: string) {
      const count = text.length
      const label = document.createElement('span')
      const amount = document.createElement('span')
      label.textContent = 'Copiado'
      amount.className = 'notice-count'
      amount.textContent = `${count} ${count === 1 ? 'caractere' : 'caracteres'}`
      element.replaceChildren(label, amount)
      const box = bar.getBoundingClientRect()
      element.style.top = `${Math.round(box.top + (box.height - element.offsetHeight) / 2)}px`
      element.classList.add('show')
      clearTimeout(timer)
      timer = setTimeout(() => element.classList.remove('show'), VISIBLE_MS)
    },
  }
}
