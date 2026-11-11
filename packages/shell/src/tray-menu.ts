import type { Autostart, StatusMenuEntry } from '@dck/core'

export interface TrayMenuDeps {
  toggleWindow(): void
  autostart: Autostart
  quit(): void
  // Pede o menu de novo depois de uma opção mudar
  onChange(): void
}

export async function buildTrayMenu(deps: TrayMenuDeps): Promise<readonly StatusMenuEntry[]> {
  const autostart = await deps.autostart.isEnabled()
  return [
    { type: 'action', label: 'Mostrar ou ocultar', run: deps.toggleWindow },
    {
      type: 'toggle',
      label: 'Iniciar com o sistema',
      checked: autostart,
      run: (next) => {
        void deps.autostart.setEnabled(next).then(deps.onChange)
      },
    },
    { type: 'separator' },
    { type: 'action', label: 'Sair', run: deps.quit },
  ]
}
