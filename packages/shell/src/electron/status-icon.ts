import type { StatusIcon, StatusIconHost, StatusMenuEntry } from '@dck/core'

export interface MenuTemplateItem {
  label?: string
  type?: 'normal' | 'checkbox' | 'separator'
  checked?: boolean
  click?: (item: { checked: boolean }) => void
}

export interface TrayLike {
  setToolTip(tooltip: string): void
  setContextMenu(menu: unknown): void
  destroy(): void
}

export interface TrayApi {
  createTray(iconPath: string): TrayLike
  buildMenu(template: MenuTemplateItem[]): unknown
}

export function toMenuTemplate(entries: readonly StatusMenuEntry[]): MenuTemplateItem[] {
  return entries.map((entry): MenuTemplateItem => {
    if (entry.type === 'separator') return { type: 'separator' }
    if (entry.type === 'toggle') {
      return {
        label: entry.label,
        type: 'checkbox',
        checked: entry.checked,
        click: (item) => entry.run(item.checked),
      }
    }
    return { label: entry.label, click: () => entry.run() }
  })
}

export function createElectronStatusIcon(api: TrayApi, iconPath: string): StatusIconHost {
  return {
    create({ tooltip, menu }): StatusIcon {
      const tray = api.createTray(iconPath)
      tray.setToolTip(tooltip)
      tray.setContextMenu(api.buildMenu(toMenuTemplate(menu)))
      return {
        setMenu: (entries) => tray.setContextMenu(api.buildMenu(toMenuTemplate(entries))),
        dispose: () => tray.destroy(),
      }
    },
  }
}
