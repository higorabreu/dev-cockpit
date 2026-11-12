import { describe, expect, it } from 'vitest'
import { createElectronDockWindow } from './dock-window.ts'
import { createElectronScreen } from './screen.ts'
import { createElectronShortcuts } from './shortcuts.ts'

describe('createElectronScreen', () => {
  it('should return the display of the point with a string id when asking for the nearest display', () => {
    const screen = createElectronScreen({
      getCursorScreenPoint: () => ({ x: 10, y: 20 }),
      getDisplayNearestPoint: () => ({
        id: 42,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 32, width: 1920, height: 1048 },
      }),
    })

    const display = screen.displayNearest(screen.cursorPoint())

    expect(display).toEqual({
      id: '42',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 32, width: 1920, height: 1048 },
    })
  })
})

describe('createElectronDockWindow', () => {
  function fakeWindow() {
    const calls: string[] = []
    return {
      calls,
      api: {
        isVisible: () => true,
        isFocused: () => false,
        getBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }),
        setBounds: () => calls.push('setBounds'),
        show: () => calls.push('show'),
        hide: () => calls.push('hide'),
        focus: () => calls.push('focus'),
      },
    }
  }

  it('should call the shown hook after showing the window when it is shown', () => {
    const { api, calls } = fakeWindow()
    const dock = createElectronDockWindow(api, { onShown: () => calls.push('onShown') })

    dock.show()

    expect(calls).toEqual(['show', 'onShown'])
  })

  it('should delegate the state queries to the window when asking about it', () => {
    const { api } = fakeWindow()

    const dock = createElectronDockWindow(api)

    expect(dock.isVisible()).toBe(true)
    expect(dock.isFocused()).toBe(false)
    expect(dock.bounds()).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})

describe('createElectronShortcuts', () => {
  it('should report whether the accelerator was registered when registering', () => {
    const shortcuts = createElectronShortcuts({
      register: (key) => key === 'F9',
      unregister: () => {},
    })

    expect(shortcuts.register('F9', () => {})).toBe(true)
    expect(shortcuts.register('F12', () => {})).toBe(false)
  })
})
