export interface MenuAction {
  readonly label: string
  readonly enabled: boolean
  run(): void
}

// Menu de contexto de uma aba; fecha ao clicar fora ou com Esc
export function createTabMenu(element: HTMLElement) {
  const close = () => {
    element.hidden = true
  }

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

  return {
    isOpen: () => !element.hidden,
    close,
    open(actions: readonly MenuAction[], x: number, y: number, above: boolean) {
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
      const { width, height } = element.getBoundingClientRect()
      element.style.left = `${Math.max(4, Math.min(x, window.innerWidth - width - 4))}px`
      element.style.top = `${Math.max(4, above ? y - height - 6 : y + 6)}px`
    },
  }
}
