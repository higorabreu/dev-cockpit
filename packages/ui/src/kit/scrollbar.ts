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

export const overflows = (list: HTMLElement) => list.scrollHeight > list.clientHeight

// A padded list marks when its content overflows, so its style can trade the right padding for the
// scrollbar strip and match it on the left. It follows the list's size and its rows; the returned function
// stops watching
export function watchOverflow(list: HTMLElement): () => void {
  const update = () => list.toggleAttribute('data-overflow', overflows(list))
  const resized = new ResizeObserver(update)
  const changed = new MutationObserver(update)
  resized.observe(list)
  changed.observe(list, { childList: true })
  update()
  return () => {
    resized.disconnect()
    changed.disconnect()
  }
}
