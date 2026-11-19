import { createDockController } from '@dck/core'
import { FakeDockWindow, FakeScheduler, FakeScreen } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import type { SystemScreen } from '../electron/screen.ts'
import { createDockActions } from './dock-actions.ts'
import { boundedScreen, createWaylandArea, type Size } from './linux/wayland-bounds.ts'

// Native Wayland: Electron sees the whole 1600x900 monitor, the compositor leaves 1600x868 below the top bar
const monitor = { x: 0, y: 0, width: 1600, height: 900 }
const compositorArea = { width: 1600, height: 868 }

const electronScreen: SystemScreen = {
  cursorPoint: () => ({ x: 0, y: 0 }),
  displayNearest: () => ({ id: '1', bounds: monitor, workArea: monitor, source: 'electron' }),
}

function setup(answers: (Size | undefined)[]) {
  let reads = 0
  const area = createWaylandArea(async () => {
    reads += 1
    return answers.shift()
  })
  const window = new FakeDockWindow()
  const dock = createDockController({
    screen: boundedScreen(electronScreen, () => area.current()),
    window,
    scheduler: new FakeScheduler(),
    heightRatio: 0.5,
  })
  return { reads: () => reads, window, dock, actions: createDockActions(dock, area) }
}

describe('createDockActions', () => {
  it('should size the window from the compositor when showing it', async () => {
    const { window, actions } = setup([compositorArea])

    await actions.show()

    expect(window.bounds()).toEqual({ x: 0, y: 0, width: 1600, height: 434 })
  })

  it('should keep the monitor scale when the compositor gives the size', async () => {
    const area = createWaylandArea(async () => compositorArea)
    const scaled: SystemScreen = {
      cursorPoint: () => ({ x: 0, y: 0 }),
      displayNearest: () => ({
        ...electronScreen.displayNearest({ x: 0, y: 0 }),
        scaleFactor: 1.25,
      }),
    }
    await area.refresh()

    const display = boundedScreen(scaled, () => area.current()).displayNearest({ x: 0, y: 0 })

    expect(display.workArea).toEqual({ x: 0, y: 0, width: 1600, height: 868 })
    expect(display.scaleFactor).toBe(1.25)
  })

  it('should ask the compositor before going full height when no size is known yet', async () => {
    const { window, dock, actions } = setup([compositorArea])
    dock.show()

    await actions.toggleFullHeight()

    expect(dock.isFullHeight()).toBe(true)
    expect(window.bounds().height).toBe(868)
  })

  it('should reuse the known size when going full height after a show', async () => {
    const { reads, window, actions } = setup([compositorArea])
    await actions.show()

    await actions.toggleFullHeight()

    expect(reads()).toBe(1)
    expect(window.bounds().height).toBe(868)
  })

  it('should keep the last size when the compositor does not answer on a later show', async () => {
    const { window, actions } = setup([compositorArea, undefined])
    await actions.show()

    await actions.show()

    expect(window.isVisible()).toBe(true)
    expect(window.bounds().height).toBe(434)
  })

  it('should bring a visible window forward without hiding it when presenting', async () => {
    const { window, actions } = setup([compositorArea, compositorArea])
    await actions.show()
    window.blur()
    const callsBefore = window.calls.length

    await actions.present()

    expect(window.calls.slice(callsBefore)).toEqual(['focus'])
    expect(window.isVisible()).toBe(true)
  })

  it('should size a hidden window from the compositor when presenting', async () => {
    const { window, actions } = setup([compositorArea])

    await actions.present()

    expect(window.isVisible()).toBe(true)
    expect(window.bounds()).toEqual({ x: 0, y: 0, width: 1600, height: 434 })
  })

  it('should show the dock directly when there is no compositor to ask', async () => {
    const window = new FakeDockWindow()
    const screen = new FakeScreen([{ id: '1', bounds: monitor, workArea: monitor }], { x: 0, y: 0 })
    const dock = createDockController({ screen, window, scheduler: new FakeScheduler() })
    const actions = createDockActions(dock)

    await actions.show()
    await actions.toggleFullHeight()

    expect(dock.isFullHeight()).toBe(true)
    expect(window.bounds().height).toBe(900)
  })
})
