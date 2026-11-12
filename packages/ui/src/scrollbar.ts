const VISIBLE_MS = 1000

// A barra do DS fica transparente em repouso; rolar a deixa visível por um instante, como a do terminal.
// `scroll` não borbulha, então o ouvinte é de captura e serve a toda lista com a classe `scroll`
export function installScrollbars() {
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>()
  document.addEventListener(
    'scroll',
    (event) => {
      const list = event.target
      if (!(list instanceof HTMLElement) || !list.classList.contains('scroll')) return
      list.dataset.scrolling = 'true'
      clearTimeout(timers.get(list))
      timers.set(
        list,
        setTimeout(() => delete list.dataset.scrolling, VISIBLE_MS),
      )
    },
    true,
  )
}
