export interface ShortcutActions {
  newTab(): void
  closeTab(): void
  nextTab(): void
  previousTab(): void
  goToTab(index: number): void
  toggleTheme(): void
  searchProjects(): void
}

// Ouvido na fase de captura: as teclas do app não chegam ao shell
export function bindShortcuts(actions: ShortcutActions): () => void {
  const handle = (event: KeyboardEvent) => {
    const run = (action: () => void) => {
      action()
      event.preventDefault()
      event.stopPropagation()
    }

    if (event.ctrlKey && !event.altKey && event.key === 'Tab') {
      return run(event.shiftKey ? actions.previousTab : actions.nextTab)
    }
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      if (event.key === 'PageDown') return run(actions.nextTab)
      if (event.key === 'PageUp') return run(actions.previousTab)
    }
    if (event.ctrlKey && event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 't') return run(actions.newTab)
      if (key === 'w') return run(actions.closeTab)
      if (key === 'l') return run(actions.toggleTheme)
      if (key === 'o') return run(actions.searchProjects)
    }
    if (event.altKey && !event.ctrlKey && /^[1-9]$/.test(event.key)) {
      return run(() => actions.goToTab(Number(event.key) - 1))
    }
  }
  window.addEventListener('keydown', handle, true)
  return () => window.removeEventListener('keydown', handle, true)
}
