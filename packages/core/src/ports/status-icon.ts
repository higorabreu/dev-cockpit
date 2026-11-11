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
  // Refaz o menu, por exemplo depois de uma opção mudar de estado
  setMenu(entries: readonly StatusMenuEntry[]): void
  dispose(): void
}

// Ícone na bandeja ou barra de status do sistema, com um menu
export interface StatusIconHost {
  create(options: {
    readonly tooltip: string
    readonly menu: readonly StatusMenuEntry[]
  }): StatusIcon
}
