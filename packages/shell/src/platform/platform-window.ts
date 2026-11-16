import type { DockWindow, Translate } from '@dck/core'

export interface PlacedWindow {
  setAlwaysOnTop(flag: boolean, level: 'screen-saver'): void
  setVisibleOnAllWorkspaces(
    visible: boolean,
    options?: { visibleOnFullScreen: boolean; skipTransformProcessType: boolean },
  ): void
}

export interface FocusTarget {
  focus(): void
}

export interface AppMenuItem {
  readonly label?: string
  readonly accelerator?: string
  readonly type?: 'separator'
  // Electron builds the menu and its keys itself, in the system's language
  readonly role?: 'editMenu'
  readonly click?: () => void
  readonly submenu?: AppMenuItem[]
}

export interface AppMenuDeps {
  t: Translate
  openSettings(): void
  quit(): void
}

// How the anchored window is created and behaves on one system; main.ts calls it without asking which
export interface PlatformWindow {
  // Spread into the BrowserWindow options, so a key that is absent here stays absent there
  readonly options: { readonly type?: 'panel' }
  place(window: PlacedWindow): void
  dock(window: DockWindow, contents: FocusTarget): DockWindow
  menu?(deps: AppMenuDeps): AppMenuItem[]
}
