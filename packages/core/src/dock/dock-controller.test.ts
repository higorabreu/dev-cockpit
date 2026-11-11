import { describe, expect, it } from 'vitest'
import type { Display } from '../ports/index.ts'
import { FakeDockWindow, FakeScheduler, FakeScreen } from '../testing/index.ts'
import { createDockController, dockBounds } from './dock-controller.ts'

const display = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  topBar = 0,
): Display => ({
  id,
  bounds: { x, y, width, height },
  workArea: { x, y: y + topBar, width, height: height - topBar },
})

const left = display('left', 0, 0, 1920, 1080)
const center = display('center', 1920, 0, 1920, 1080, 32)
const right = display('right', 3840, 0, 1920, 1200)

function setup(cursor = { x: 300, y: 300 }, ignoresOrigin = false) {
  const screen = new FakeScreen([left, center, right], cursor)
  const window = new FakeDockWindow(ignoresOrigin)
  const scheduler = new FakeScheduler()
  const dock = createDockController({ screen, window, scheduler })
  return { screen, window, scheduler, dock }
}

describe('dockBounds', () => {
  it('should anchor to the top of the work area with half the height when not full height', () => {
    const workArea = { x: 1920, y: 32, width: 1920, height: 985 }

    const result = dockBounds(workArea, 0.5, false)

    expect(result).toEqual({ x: 1920, y: 32, width: 1920, height: 493 })
  })

  it('should use the whole work area height when full height', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1080 }

    const result = dockBounds(workArea, 0.5, true)

    expect(result.height).toBe(1080)
  })
})

describe('toggle', () => {
  it('should show the window on the display of the cursor when it is hidden', () => {
    const { dock, window } = setup({ x: 2220, y: 300 })

    dock.toggle()

    expect(window.isVisible()).toBe(true)
    expect(window.bounds()).toEqual({ x: 1920, y: 32, width: 1920, height: 524 })
  })

  it('should hide the window when it is visible and focused', () => {
    const { dock, window } = setup()
    dock.show()

    dock.toggle()

    expect(window.isVisible()).toBe(false)
  })

  it('should move the window to the display of the cursor when it is visible but not focused', () => {
    const { dock, window, screen } = setup({ x: 300, y: 300 })
    dock.show()
    window.blur()
    screen.cursor = { x: 4140, y: 300 }

    dock.toggle()

    expect(window.isVisible()).toBe(true)
    expect(window.bounds()).toEqual({ x: 3840, y: 0, width: 1920, height: 600 })
  })

  it('should follow the cursor to a different display each time it is shown', () => {
    const { dock, window, screen } = setup({ x: 4140, y: 300 })
    dock.show()
    dock.hide()
    screen.cursor = { x: 2220, y: 300 }

    dock.show()

    expect(window.bounds().x).toBe(1920)
  })
})

describe('show', () => {
  it('should place the window correctly when the window manager ignores the origin before showing', () => {
    const { dock, window } = setup({ x: 300, y: 300 }, true)

    dock.show()

    expect(window.bounds()).toEqual({ x: 0, y: 0, width: 1920, height: 540 })
  })

  it('should reapply the bounds shortly after showing when the window manager moved the window late', () => {
    const { dock, window, scheduler } = setup()
    dock.show()
    window.setBounds({ x: 10, y: 10, width: 100, height: 100 })

    scheduler.advance(250)

    expect(window.bounds()).toEqual({ x: 0, y: 0, width: 1920, height: 540 })
  })

  it('should not reapply the bounds when the window was hidden before the delay passed', () => {
    const { dock, window, scheduler } = setup()
    dock.show()
    dock.hide()
    const callsBefore = window.calls.length

    scheduler.advance(500)

    expect(window.calls.length).toBe(callsBefore)
  })
})

describe('toggleFullHeight', () => {
  it('should use the full work area height on the display where the window is', () => {
    const { dock, window } = setup({ x: 2220, y: 300 })
    dock.show()

    dock.toggleFullHeight()

    expect(window.bounds()).toEqual({ x: 1920, y: 32, width: 1920, height: 1048 })
    expect(dock.isFullHeight()).toBe(true)
  })

  it('should return to half height when toggled twice', () => {
    const { dock, window } = setup({ x: 2220, y: 300 })
    dock.show()

    dock.toggleFullHeight()
    dock.toggleFullHeight()

    expect(window.bounds().height).toBe(524)
    expect(dock.isFullHeight()).toBe(false)
  })

  it('should keep full height when the window is shown again on another display', () => {
    const { dock, window, screen } = setup({ x: 2220, y: 300 })
    dock.show()
    dock.toggleFullHeight()
    dock.hide()
    screen.cursor = { x: 4140, y: 300 }

    dock.show()

    expect(window.bounds()).toEqual({ x: 3840, y: 0, width: 1920, height: 1200 })
  })
})
