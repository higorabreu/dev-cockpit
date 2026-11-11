import type { TabsState } from '@dck/core'

export interface TabBarCallbacks {
  activate(id: string): void
  contextMenu(id: string, x: number, y: number): void
  reorder(ids: readonly string[]): void
}

export function createTabBar(
  container: HTMLElement,
  callbacks: TabBarCallbacks,
  finishedLabel: string,
) {
  let dragging: HTMLElement | undefined

  const idOf = (button: Element) => (button as HTMLElement).dataset.id ?? ''
  const currentOrder = () => [...container.children].map(idOf)

  return {
    render(state: TabsState, unseen: ReadonlySet<string> = new Set()) {
      container.replaceChildren(
        ...state.tabs.map((tab) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'tab'
          button.dataset.id = tab.id
          button.draggable = true
          button.setAttribute('role', 'tab')
          button.setAttribute('aria-selected', String(tab.id === state.activeId))
          button.textContent = tab.label
          if (unseen.has(tab.id)) {
            const pip = document.createElement('span')
            pip.className = 'pip'
            pip.setAttribute('role', 'img')
            pip.setAttribute('aria-label', finishedLabel)
            button.append(pip)
          }
          button.addEventListener('click', () => callbacks.activate(tab.id))
          button.addEventListener('contextmenu', (event) => {
            event.preventDefault()
            callbacks.contextMenu(tab.id, event.clientX, event.clientY)
          })
          button.addEventListener('dragstart', (event) => {
            dragging = button
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
            button.classList.add('dragging')
          })
          button.addEventListener('dragover', (event) => {
            if (!dragging || dragging === button) return
            event.preventDefault()
            const box = button.getBoundingClientRect()
            container.insertBefore(
              dragging,
              event.clientX > box.left + box.width / 2 ? button.nextSibling : button,
            )
          })
          button.addEventListener('dragend', () => {
            button.classList.remove('dragging')
            dragging = undefined
            callbacks.reorder(currentOrder())
          })
          return button
        }),
      )
    },
  }
}
