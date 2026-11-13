import { FakeDockWindow } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import type { PlacedWindow } from '../platform-window.ts'
import { activateOnFocus, buildAppMenu, createPanelWindow, type PanelApp } from './panel-window.ts'

function recordingApp(calls: unknown[]): PanelApp {
  return {
    focus: (options) => void calls.push(`app.focus ${JSON.stringify(options)}`),
    hide: () => void calls.push('app.hide'),
    dock: { hide: () => void calls.push('dock.hide') },
  }
}

// Records each window call with its arguments, so a missing or extra argument shows up
function recordingWindow(calls: unknown[]): PlacedWindow {
  return {
    setAlwaysOnTop: (...args) => void calls.push(['setAlwaysOnTop', ...args]),
    setVisibleOnAllWorkspaces: (...args) => void calls.push(['setVisibleOnAllWorkspaces', ...args]),
  }
}

describe('createPanelWindow', () => {
  it('should hide the Dock icon before anchoring when the panel is placed', () => {
    // Arrange
    const calls: unknown[] = []
    const panel = createPanelWindow(recordingApp(calls))

    // Act
    panel.place(recordingWindow(calls))

    // Assert
    expect(calls[0]).toBe('dock.hide')
    expect(calls).toHaveLength(3)
  })

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

  it('should hide the app after the panel when the dock hides the panel', () => {
    // Arrange
    const window = new FakeDockWindow()
    const dock = createPanelWindow(recordingApp(window.calls)).dock(window, {
      focus: () => undefined,
    })
    dock.show()
    dock.focus()

    // Act
    dock.hide()

    // Assert
    expect(window.calls.slice(-2)).toEqual(['hide', 'app.hide'])
    expect(dock.isVisible()).toBe(false)
  })
})

describe('activateOnFocus', () => {
  it('should activate the app after focusing the window when the window is focused', () => {
    const window = new FakeDockWindow()
    const dock = activateOnFocus(
      window,
      () => window.calls.push('activate'),
      () => undefined,
    )

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
