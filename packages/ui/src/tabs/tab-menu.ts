export interface MenuAction {
  readonly label: string
  readonly enabled: boolean
  run(): void
}

const STEPS: Record<string, (index: number, count: number) => number> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
}

// Small context menu (a tab, a folder in the terminal); closes on outside click or Esc
export function createTabMenu(element: HTMLElement) {
  // Where the focus goes back when the menu closes without running anything else
  let restore: (() => void) | undefined

  const close = () => {
    if (element.hidden) return
    element.hidden = true
    const back = restore
    restore = undefined
    back?.()
  }

  const items = () => [...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]

  window.addEventListener(
    'mousedown',
    (event) => {
      if (!element.hidden && !element.contains(event.target as Node)) close()
    },
    true,
  )
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || element.hidden) return
      close()
      event.preventDefault()
      event.stopPropagation()
    },
    true,
  )
  // Enter and Space press the focused item as any button does
  element.addEventListener('keydown', (event) => {
    const step = STEPS[event.key]
    const enabled = items()
    if (!step || enabled.length === 0) return
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement)
    enabled[step(Math.max(index, 0), enabled.length)]?.focus()
    event.preventDefault()
  })

  return {
    isOpen: () => !element.hidden,
    close,
    open(
      actions: readonly MenuAction[],
      x: number,
      y: number,
      above: boolean,
      onClose?: () => void,
    ) {
      element.replaceChildren(
        ...actions.map((action) => {
          const item = document.createElement('button')
          item.type = 'button'
          item.setAttribute('role', 'menuitem')
          item.textContent = action.label
          item.disabled = !action.enabled
          item.addEventListener('click', () => {
            close()
            action.run()
          })
          return item
        }),
      )
      element.hidden = false
      restore = onClose
      const { width, height } = element.getBoundingClientRect()
      const fitsBelow = y + 6 + height <= window.innerHeight - 4
      element.style.left = `${Math.max(4, Math.min(x, window.innerWidth - width - 4))}px`
      element.style.top = `${Math.max(4, above || !fitsBelow ? y - height - 6 : y + 6)}px`
      items()[0]?.focus()
    },
  }
}
