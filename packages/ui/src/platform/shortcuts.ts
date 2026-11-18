import { inputGate } from './input-gate.ts'
import type { Keymap, ShortcutId } from './keymap.ts'

export interface ShortcutActions {
  newTab(): void
  closeTab(): void
  renameTab(): void
  toggleReview(): void
  toggleReviewLayout(): void
  sendReview(): void
  nextTab(): void
  previousTab(): void
  goToTab(index: number): void
  toggleTheme(): void
  openSettings(): void
  openViews(): void
  searchProjects(): void
  togglePanel(): void
  toggleFullHeight(): void
  changeOpacity(direction: 1 | -1): void
  changeFontSize(delta: number | 'reset'): void
}

// Listened for in the capture phase: the app's keys never reach the shell
export function bindShortcuts(actions: ShortcutActions, keymap: Keymap): () => void {
  const bindings: ReadonlyArray<readonly [ShortcutId, () => void]> = [
    ['newTab', actions.newTab],
    ['closeTab', actions.closeTab],
    ['renameTab', actions.renameTab],
    ['nextTab', actions.nextTab],
    ['previousTab', actions.previousTab],
    ['settings', actions.openSettings],
    ['review', actions.toggleReview],
    ['reviewLayout', actions.toggleReviewLayout],
    ['reviewSend', actions.sendReview],
    ['theme', actions.toggleTheme],
    ['projects', actions.searchProjects],
    ['views', actions.openViews],
    ['panel', actions.togglePanel],
    ['fullHeight', actions.toggleFullHeight],
    ['opacityUp', () => actions.changeOpacity(1)],
    ['opacityDown', () => actions.changeOpacity(-1)],
    ['fontBigger', () => actions.changeFontSize(1)],
    ['fontSmaller', () => actions.changeFontSize(-1)],
    ['fontReset', () => actions.changeFontSize('reset')],
  ]
  const handle = (event: KeyboardEvent) => {
    if (inputGate.blocked) return
    const tab = keymap.tabIndex(event)
    const action =
      tab === undefined
        ? bindings.find(([id]) => keymap.matches(event, id))?.[1]
        : () => actions.goToTab(tab)
    if (!action) return
    action()
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('keydown', handle, true)
  return () => window.removeEventListener('keydown', handle, true)
}
