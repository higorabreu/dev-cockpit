import type { Autostart, StatusMenuEntry, Translate } from '@dck/core'

export interface TrayMenuDeps {
  toggleWindow(): void
  autostart: Autostart
  t: Translate
  quit(): void
  // Pede o menu de novo depois de uma opção mudar
  onChange(): void
}

export async function buildTrayMenu(deps: TrayMenuDeps): Promise<readonly StatusMenuEntry[]> {
  const autostart = await deps.autostart.isEnabled()
  return [
    { type: 'action', label: deps.t('tray.toggle'), run: deps.toggleWindow },
    {
      type: 'toggle',
      label: deps.t('tray.autostart'),
      checked: autostart,
      run: (next) => {
        void deps.autostart.setEnabled(next).then(deps.onChange)
      },
    },
    { type: 'separator' },
    { type: 'action', label: deps.t('tray.quit'), run: deps.quit },
  ]
}
