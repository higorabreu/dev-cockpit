import { FakeDockWindow } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { activateOnFocus, buildAppMenu, createPanelWindow, type PanelApp } from './panel-window.ts'

function recordingApp(calls: string[]): PanelApp {
  return {
    focus: (options) => void calls.push(`app.focus ${JSON.stringify(options)}`),
    dock: { hide: () => void calls.push('dock.hide') },
  }
}

describe('createPanelWindow', () => {
  it('should activate the app and then focus the page when the dock focuses the panel', () => {
    // Arrange
    const window = new FakeDockWindow()
    const dock = createPanelWindow(recordingApp(window.calls)).dock(window, {
      focus: () => window.calls.push('contents.focus'),
    })
    dock.show()

    // Act
    dock.focus()

    // Assert
    expect(window.calls.slice(-3)).toEqual(['focus', 'app.focus {"steal":true}', 'contents.focus'])
  })
})

describe('activateOnFocus', () => {
  it('should activate the app after focusing the window when the window is focused', () => {
    const window = new FakeDockWindow()
    const dock = activateOnFocus(window, () => window.calls.push('activate'))

    dock.focus()

    expect(window.calls.slice(-2)).toEqual(['focus', 'activate'])
  })
})

describe('buildAppMenu', () => {
  it('should offer settings with Cmd+comma and quit with Cmd+Q when building the menu', () => {
    const ran: string[] = []

    const [app] = buildAppMenu({
      t: (key) => `[${key}]`,
      openSettings: () => ran.push('settings'),
      quit: () => ran.push('quit'),
    })
    const items = app?.submenu ?? []
    for (const item of items) item.click?.()

    expect(items.map((item) => [item.label, item.accelerator])).toEqual([
      ['[tray.settings]', 'Command+,'],
      [undefined, undefined],
      ['[tray.quit]', 'Command+Q'],
    ])
    expect(ran).toEqual(['settings', 'quit'])
  })
})
