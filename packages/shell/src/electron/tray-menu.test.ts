import { createTranslator } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { buildTrayMenu } from './tray-menu.ts'

function setup(enabled = false, locale: 'pt-BR' | 'en' = 'pt-BR') {
  let state = enabled
  let toggles = 0
  let opened = 0
  let quits = 0
  let changes = 0
  const deps = {
    t: createTranslator(locale).t,
    toggleWindow: () => {
      toggles += 1
    },
    openSettings: () => {
      opened += 1
    },
    autostart: {
      isEnabled: async () => state,
      setEnabled: async (next: boolean) => {
        state = next
      },
    },
    quit: () => {
      quits += 1
    },
    onChange: () => {
      changes += 1
    },
  }
  return { deps, counts: () => ({ toggles, quits, changes, opened }), state: () => state }
}

describe('buildTrayMenu', () => {
  it('should list show or hide, autostart and quit in that order when building the menu', async () => {
    const { deps } = setup()

    const menu = await buildTrayMenu(deps)

    expect(menu.map((entry) => (entry.type === 'separator' ? '-' : entry.label))).toEqual([
      'Mostrar ou ocultar',
      'Configurações',
      'Iniciar com o sistema',
      '-',
      'Sair',
    ])
  })

  it('should reflect the current autostart state when building the menu', async () => {
    const { deps } = setup(true)

    const menu = await buildTrayMenu(deps)

    expect(menu[2]).toMatchObject({ type: 'toggle', checked: true })
  })

  it('should toggle the window when the first entry runs', async () => {
    const { deps, counts } = setup()
    const menu = await buildTrayMenu(deps)

    if (menu[0]?.type === 'action') menu[0].run()

    expect(counts().toggles).toBe(1)
  })

  it('should change autostart and ask for a new menu when the toggle runs', async () => {
    const { deps, counts, state } = setup(false)
    const menu = await buildTrayMenu(deps)

    if (menu[2]?.type === 'toggle') menu[2].run(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(state()).toBe(true)
    expect(counts().changes).toBe(1)
  })

  it('should quit the app when the last entry runs', async () => {
    const { deps, counts } = setup()
    const menu = await buildTrayMenu(deps)

    if (menu[4]?.type === 'action') menu[4].run()

    expect(counts().quits).toBe(1)
  })

  it('should use the language of the translator when building the labels', async () => {
    const { deps } = setup(false, 'en')

    const menu = await buildTrayMenu(deps)

    expect(menu.map((entry) => (entry.type === 'separator' ? '-' : entry.label))).toEqual([
      'Show or hide',
      'Settings',
      'Start with the system',
      '-',
      'Quit',
    ])
  })

  it('should open the settings when the settings entry runs', async () => {
    const { deps, counts } = setup()
    const menu = await buildTrayMenu(deps)

    if (menu[1]?.type === 'action') menu[1].run()

    expect(counts().opened).toBe(1)
  })
})
