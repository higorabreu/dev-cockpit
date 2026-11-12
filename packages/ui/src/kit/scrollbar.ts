const VISIBLE_MS = 1000

// The DS scrollbar is transparent at rest; scrolling makes it visible for a moment, like the terminal's.
// `scroll` does not bubble, so the listener captures and serves every list with the `scroll` class
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
