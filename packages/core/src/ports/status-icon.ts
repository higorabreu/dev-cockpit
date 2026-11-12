export type StatusMenuEntry =
  | { readonly type: 'action'; readonly label: string; run(): void }
  | {
      readonly type: 'toggle'
      readonly label: string
      readonly checked: boolean
      run(next: boolean): void
    }
  | { readonly type: 'separator' }

export interface StatusIcon {
  // Rebuilds the menu, for example after an option changes state
  setMenu(entries: readonly StatusMenuEntry[]): void
  dispose(): void
}

// Icon in the system tray or status bar, with a menu
export interface StatusIconHost {
  create(options: {
    readonly tooltip: string
    readonly menu: readonly StatusMenuEntry[]
  }): StatusIcon
}
