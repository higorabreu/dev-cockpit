import { inputGate } from './input-gate.ts'
import type { Keymap, ShortcutId, TabTarget } from './keymap.ts'

export interface ShortcutActions {
  newTab(): void
  closeTab(): void
  renameTab(): void
  toggleReview(): void
  toggleReviewLayout(): void
  sendReview(): void
  nextTab(): void
  previousTab(): void
  goToTab(target: TabTarget): void
  toggleTheme(): void
  openSettings(): void
  openViews(): void
  searchProjects(): void
  searchFiles(): void
  togglePanel(): void
  toggleFullHeight(): void
  changeOpacity(direction: 1 | -1): void
  changeFontSize(delta: number | 'reset'): void
  clearTerminal(): void
  toggleFile(): void
}

// Listened for in the capture phase: the app's keys never reach the shell
export function bindShortcuts(actions: ShortcutActions, keymap: Keymap): () => void {
  const bindings: Readonly<Record<ShortcutId, () => void>> = {
    newTab: actions.newTab,
    closeTab: actions.closeTab,
    renameTab: actions.renameTab,
    nextTab: actions.nextTab,
    previousTab: actions.previousTab,
    settings: actions.openSettings,
    review: actions.toggleReview,
    reviewLayout: actions.toggleReviewLayout,
    reviewSend: actions.sendReview,
    theme: actions.toggleTheme,
    projects: actions.searchProjects,
    fileSearch: actions.searchFiles,
    views: actions.openViews,
    panel: actions.togglePanel,
    fullHeight: actions.toggleFullHeight,
    opacityUp: () => actions.changeOpacity(1),
    opacityDown: () => actions.changeOpacity(-1),
    fontBigger: () => actions.changeFontSize(1),
    fontSmaller: () => actions.changeFontSize(-1),
    fontReset: () => actions.changeFontSize('reset'),
    clearTerminal: actions.clearTerminal,
    toggleFile: actions.toggleFile,
  }
  const handle = (event: KeyboardEvent) => {
    if (inputGate.blocked) return
    // A key the user gave an action wins over the tab digits, which no default key shares
    const id = keymap.action(event)
    const tab = id === undefined ? keymap.tabIndex(event) : undefined
    const action =
      id !== undefined ? bindings[id] : tab === undefined ? undefined : () => actions.goToTab(tab)
    if (!action) return
    action()
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('keydown', handle, true)
  return () => window.removeEventListener('keydown', handle, true)
}
