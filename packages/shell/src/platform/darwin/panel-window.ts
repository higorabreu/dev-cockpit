import type { DockWindow } from '@dck/core'
import type { AppMenuDeps, AppMenuItem, PlacedWindow, PlatformWindow } from '../platform-window.ts'

export interface PanelApp {
  focus(options: { steal: boolean }): void
  hide(): void
  readonly dock?: { hide(): void }
}

export function createPanelWindow(app: PanelApp): PlatformWindow {
  return {
    options: { type: 'panel' },
    place(window) {
      anchorPanel(window)
      app.dock?.hide()
    },
    dock: (window, contents) =>
      activateOnFocus(
        window,
        () => {
          app.focus({ steal: true })
          contents.focus()
        },
        () => app.hide(),
      ),
    menu: buildAppMenu,
  }
}

// A panel does not activate the app by itself, so the keyboard would stay with the other app; once
// activated, hiding the panel alone leaves the app active and the keyboard with no window
export function activateOnFocus(
  window: DockWindow,
  activate: () => void,
  deactivate: () => void,
): DockWindow {
  // Delegates by name: spreading would drop the methods of a class instance
  return {
    isVisible: () => window.isVisible(),
    isFocused: () => window.isFocused(),
    bounds: () => window.bounds(),
    setBounds: (bounds) => window.setBounds(bounds),
    show: () => window.show(),
    hide() {
      window.hide()
      deactivate()
    },
    focus() {
      window.focus()
      activate()
    },
  }
}

// The level and the fullscreen option put the panel above a fullscreen app, as the MAC-T1 spike checked
export function anchorPanel(window: PlacedWindow) {
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  })
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
