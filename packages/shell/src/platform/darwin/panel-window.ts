import type { DockWindow, Translate } from '@dck/core'

// A panel does not activate the app by itself, so the keyboard would stay with the other app
export function activateOnFocus(window: DockWindow, activate: () => void): DockWindow {
  return {
    ...window,
    focus() {
      window.focus()
      activate()
    },
  }
}

export interface PanelWindowApi {
  setAlwaysOnTop(flag: boolean, level: 'screen-saver'): void
  setVisibleOnAllWorkspaces(
    visible: boolean,
    options: { visibleOnFullScreen: boolean; skipTransformProcessType: boolean },
  ): void
}

// The level and the fullscreen option put the panel above a fullscreen app, as the MAC-T1 spike checked
export function anchorPanel(window: PanelWindowApi) {
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  })
}

export interface AppMenuItem {
  readonly label?: string
  readonly accelerator?: string
  readonly type?: 'separator'
  readonly click?: () => void
  readonly submenu?: AppMenuItem[]
}

export interface AppMenuDeps {
  t: Translate
  openSettings(): void
  quit(): void
}

// Without an application menu the Mac has no Cmd+Q
export function buildAppMenu(deps: AppMenuDeps): AppMenuItem[] {
  return [
    {
      label: 'Dev Cockpit',
      submenu: [
        { label: deps.t('tray.settings'), accelerator: 'Command+,', click: deps.openSettings },
        { type: 'separator' },
        { label: deps.t('tray.quit'), accelerator: 'Command+Q', click: deps.quit },
      ],
    },
  ]
}
