import type { TabsState } from '@dck/core'

export interface TabBarCallbacks {
  activate(id: string): void
  contextMenu(id: string, x: number, y: number): void
  reorder(ids: readonly string[]): void
  // Há aba que terminou fora da área visível da barra
  hiddenAttention(hidden: boolean): void
}

const FADE_PX = 24

export function createTabBar(
  container: HTMLElement,
  callbacks: TabBarCallbacks,
  finishedLabel: () => string,
) {
  let dragging: HTMLElement | undefined
  let lastActive: string | undefined
  let hiddenAttention = false

  const idOf = (button: Element) => (button as HTMLElement).dataset.id ?? ''
  const currentOrder = () => [...container.children].map(idOf)

  function hasHiddenAttention(): boolean {
    const view = container.getBoundingClientRect()
    return [...container.querySelectorAll('.pip')].some((pip) => {
      const box = pip.getBoundingClientRect()
      return box.right > view.right + 1 || box.left < view.left - 1
    })
  }

  // Esmaecido só na borda que tem mais abas e o aviso de aba terminada fora da vista
  function syncEdges() {
    const start = container.scrollLeft > 1
    const end = container.scrollLeft + container.clientWidth < container.scrollWidth - 1
    if (start && end) container.dataset.fade = 'both'
    else if (start) container.dataset.fade = 'start'
    else if (end) container.dataset.fade = 'end'
    else delete container.dataset.fade
    const hidden = hasHiddenAttention()
    if (hidden === hiddenAttention) return
    hiddenAttention = hidden
    callbacks.hiddenAttention(hidden)
  }

  container.style.scrollPaddingInline = `${FADE_PX}px`
  container.addEventListener('scroll', syncEdges, { passive: true })
  new ResizeObserver(syncEdges).observe(container)
  // A roda vertical rola a barra na horizontal
  container.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      container.scrollLeft += event.deltaY
      event.preventDefault()
    },
    { passive: false },
  )

  return {
    render(state: TabsState, unseen: ReadonlySet<string> = new Set()) {
      // Trocar os filhos zera a rolagem; sem guardar, o redesenho do vigia desfaz a rolagem do usuário
      const scrolled = container.scrollLeft
      container.replaceChildren(
        ...state.tabs.map((tab) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'tab'
          button.dataset.id = tab.id
          button.draggable = true
          button.setAttribute('role', 'tab')
          button.setAttribute('aria-selected', String(tab.id === state.activeId))
          const label = document.createElement('span')
          label.className = 'tab-label'
          label.textContent = tab.label
          button.append(label)
          if (unseen.has(tab.id)) {
            const pip = document.createElement('span')
            pip.className = 'pip'
            pip.setAttribute('role', 'img')
            pip.setAttribute('aria-label', finishedLabel())
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
      container.scrollLeft = scrolled
      if (state.activeId !== lastActive) {
        lastActive = state.activeId
        container
          .querySelector('[aria-selected="true"]')
          ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      }
      syncEdges()
    },
  }
}
