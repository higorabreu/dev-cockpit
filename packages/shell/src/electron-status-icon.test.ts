import type { StatusMenuEntry } from '@dck/core'
import { describe, expect, it } from 'vitest'
import {
  createElectronStatusIcon,
  type MenuTemplateItem,
  toMenuTemplate,
} from './electron-status-icon.ts'

describe('toMenuTemplate', () => {
  it('should map an action to a normal item that runs it when clicked', () => {
    let ran = 0
    const [item] = toMenuTemplate([
      {
        type: 'action',
        label: 'Sair',
        run: () => {
          ran += 1
        },
      },
    ])

    item?.click?.({ checked: false })

    expect(item?.label).toBe('Sair')
    expect(ran).toBe(1)
  })

  it('should map a toggle to a checkbox that passes the new state when clicked', () => {
    const seen: boolean[] = []
    const [item] = toMenuTemplate([
      { type: 'toggle', label: 'Iniciar', checked: false, run: (next) => void seen.push(next) },
    ])

    item?.click?.({ checked: true })

    expect(item).toMatchObject({ type: 'checkbox', checked: false })
    expect(seen).toEqual([true])
  })

  it('should map a separator when the entry is a separator', () => {
    expect(toMenuTemplate([{ type: 'separator' }])).toEqual([{ type: 'separator' }])
  })
})

describe('createElectronStatusIcon', () => {
  function setup() {
    const log: string[] = []
    const templates: MenuTemplateItem[][] = []
    const host = createElectronStatusIcon(
      {
        createTray: (iconPath) => {
          log.push(`tray ${iconPath}`)
          return {
            setToolTip: (tooltip) => void log.push(`tooltip ${tooltip}`),
            setContextMenu: () => void log.push('menu'),
            destroy: () => void log.push('destroy'),
          }
        },
        buildMenu: (template) => {
          templates.push(template)
          return template
        },
      },
      '/assets/icon.png',
    )
    return { host, log, templates }
  }

  const entries: StatusMenuEntry[] = [{ type: 'action', label: 'Sair', run: () => {} }]

  it('should create the tray with the icon, tooltip and menu when creating', () => {
    const { host, log } = setup()

    host.create({ tooltip: 'Dev Cockpit', menu: entries })

    expect(log).toEqual(['tray /assets/icon.png', 'tooltip Dev Cockpit', 'menu'])
  })

  it('should replace the menu when the menu is set again', () => {
    const { host, templates } = setup()
    const icon = host.create({ tooltip: 'x', menu: entries })

    icon.setMenu([{ type: 'separator' }])

    expect(templates).toHaveLength(2)
    expect(templates[1]).toEqual([{ type: 'separator' }])
  })

  it('should destroy the tray when disposing', () => {
    const { host, log } = setup()
    const icon = host.create({ tooltip: 'x', menu: entries })

    icon.dispose()

    expect(log.at(-1)).toBe('destroy')
  })
})
