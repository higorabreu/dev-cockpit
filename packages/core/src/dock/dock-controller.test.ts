import { describe, expect, it } from 'vitest'
import type { Display } from '../ports/index.ts'
import { FakeClock, FakeDockWindow, FakeScheduler, FakeScreen } from '../testing/index.ts'
import { createDockController, deviceHeight, dockBounds, dragRatio } from './dock-controller.ts'

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
  const clock = new FakeClock(10_000)
  const dock = createDockController({ screen, window, scheduler, clock })
  return { screen, window, scheduler, clock, dock }
}

// One 1920x1080 display and an anchored height the test can change, as the settings would
function anchoredAt(initial: number) {
  let ratio = initial
  const window = new FakeDockWindow()
  const dock = createDockController({
    screen: new FakeScreen([left], { x: 300, y: 300 }),
    window,
    scheduler: new FakeScheduler(),
    heightRatio: () => ratio,
  })
  return {
    dock,
    window,
    set: (next: number) => {
      ratio = next
    },
  }
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

  it('should take a height of whole device pixels when the ratio falls between them at 125%', () => {
    const workArea = { x: 0, y: 32, width: 1536, height: 832 }

    const result = dockBounds(workArea, 0.67, false, 1.25)

    expect(result.height).toBe(556)
    expect(result.height * 1.25).toBe(695)
  })

  it('should keep the whole work area when it is not whole device pixels at full height', () => {
    const workArea = { x: 0, y: 0, width: 1280, height: 721 }

    const result = dockBounds(workArea, 0.5, true, 1.5)

    expect(result.height).toBe(721)
  })
})

describe('deviceHeight', () => {
  it.each([
    [557, 1, 557],
    [557, 1.25, 556],
    [559, 1.25, 560],
    [558, 1.25, 556],
    [557, 1.5, 556],
    [557, 1.75, 556],
    [557, 2, 557],
  ])('should take %i DIPs at a scale of %f as %i', (height, scale, expected) => {
    expect(deviceHeight(height, scale, 2000)).toBe(expected)
  })

  it('should not go past the limit when the nearest whole height is above it', () => {
    expect(deviceHeight(831, 1.25, 831)).toBe(828)
  })

  it('should keep the height when no height nearby is whole device pixels at the scale', () => {
    expect(deviceHeight(557, 1.0123, 2000)).toBe(557)
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

describe('present', () => {
  it('should focus the window where it is without hiding it when it is visible but not focused', () => {
    const { dock, window, screen } = setup({ x: 300, y: 300 })
    dock.show()
    window.blur()
    screen.cursor = { x: 4140, y: 300 }
    const callsBefore = window.calls.length

    dock.present()

    expect(window.calls.slice(callsBefore)).toEqual(['focus'])
    expect(window.isVisible()).toBe(true)
    expect(window.isFocused()).toBe(true)
    expect(window.bounds()).toEqual({ x: 0, y: 0, width: 1920, height: 540 })
  })

  it('should keep the window visible when it is already visible and focused', () => {
    const { dock, window } = setup()
    dock.show()

    dock.present()

    expect(window.isVisible()).toBe(true)
    expect(window.calls).not.toContain('hide')
  })

  it('should show the window focused on the display of the cursor when it is hidden', () => {
    const { dock, window } = setup({ x: 2220, y: 300 })

    dock.present()

    expect(window.isVisible()).toBe(true)
    expect(window.isFocused()).toBe(true)
    expect(window.bounds()).toEqual({ x: 1920, y: 32, width: 1920, height: 524 })
  })
})

describe('toggle repeats', () => {
  it('should ignore a toggle that comes right after another when a key is held or delivered twice', () => {
    const { window, clock, dock } = setup()
    dock.toggle()
    window.focus()

    clock.time += 100
    dock.toggle()

    expect(window.isVisible()).toBe(true)
  })

  it('should hide on the next toggle when it comes after the repeat window', () => {
    const { window, clock, dock } = setup()
    dock.toggle()
    window.focus()

    clock.time += 400
    dock.toggle()

    expect(window.isVisible()).toBe(false)
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

  it('should stay on the display where it was shown when the reported window position is wrong', () => {
    const { dock, window, scheduler } = setup({ x: 300, y: 300 })
    dock.show()
    window.setBounds({ x: 3900, y: 0, width: 1920, height: 540 })

    dock.toggleFullHeight()
    scheduler.advance(250)

    expect(window.bounds()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('should reapply the bounds shortly after toggling when the window manager moved the window late', () => {
    const { dock, window, scheduler } = setup({ x: 300, y: 300 })
    dock.show()
    dock.toggleFullHeight()
    window.setBounds({ x: 3840, y: 0, width: 1920, height: 1080 })

    scheduler.advance(250)

    expect(window.bounds()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
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

  it('should leave full height to half the screen and return it when the anchored height is 100%', () => {
    // Arrange
    const { dock, window, set } = anchoredAt(0.4)
    dock.show()
    dock.toggleFullHeight()
    set(1)
    dock.refresh()

    // Act
    const saved = dock.toggleFullHeight()

    // Assert
    expect(saved).toBe(0.5)
    expect(dock.isFullHeight()).toBe(false)
    expect(window.bounds().height).toBe(540)
  })

  it('should go to half the screen when switched at an anchored height of 100%', () => {
    // Arrange
    const { dock, window } = anchoredAt(1)
    dock.show()

    // Act
    const saved = dock.toggleFullHeight()

    // Assert
    expect(saved).toBe(0.5)
    expect(dock.fillsHeight()).toBe(false)
    expect(window.bounds().height).toBe(540)
  })

  it('should return nothing to save when leaving full height to an anchored height below 100%', () => {
    const { dock } = anchoredAt(0.4)
    dock.show()
    dock.toggleFullHeight()

    expect(dock.toggleFullHeight()).toBeUndefined()
  })

  it('should follow the saved height again once the settings change after leaving full height', () => {
    // Arrange
    const anchored = anchoredAt(1)
    anchored.dock.show()
    anchored.dock.toggleFullHeight()

    // Act
    anchored.set(0.7)
    anchored.dock.refresh()

    // Assert
    expect(anchored.window.bounds().height).toBe(756)
  })

  describe('height ratio', () => {
    it('should follow the ratio at the moment of showing when the ratio is a function', () => {
      let ratio = 0.5
      const screen = new FakeScreen([left], { x: 300, y: 300 })
      const window = new FakeDockWindow()
      const dock = createDockController({
        screen,
        window,
        scheduler: new FakeScheduler(),
        heightRatio: () => ratio,
      })

      dock.show()
      expect(window.bounds().height).toBe(540)
      ratio = 0.7
      dock.hide()
      dock.show()

      expect(window.bounds().height).toBe(756)
    })

    it('should reapply the size in place when refreshing a visible window', () => {
      let ratio = 0.5
      const screen = new FakeScreen([left], { x: 300, y: 300 })
      const window = new FakeDockWindow()
      const dock = createDockController({
        screen,
        window,
        scheduler: new FakeScheduler(),
        heightRatio: () => ratio,
      })
      dock.show()

      ratio = 0.3
      dock.refresh()

      expect(window.bounds().height).toBe(324)
    })

    it('should not touch a hidden window when refreshing', () => {
      const { dock, window } = setup()

      dock.refresh()

      expect(window.calls).toEqual([])
    })
  })
})

describe('dragRatio', () => {
  it.each([
    [600, 0.6],
    [100, 0.3],
    [1200, 1],
    [508, 0.5],
    [990, 1],
    [737, 0.737],
  ])(
    'should take %i pixels of a 1000 pixel work area as %f when the edge is dragged',
    (height, ratio) => {
      expect(dragRatio(1000, height, 0.3)).toBe(ratio)
    },
  )
})

describe('resizeTo', () => {
  it('should follow the dragged edge on the display where the window is and keep its top', () => {
    // Arrange
    const { dock, window } = setup({ x: 2220, y: 300 })
    dock.show()

    // Act
    const ratio = dock.resizeTo(629)

    // Assert
    expect(ratio).toBe(0.6)
    expect(window.bounds()).toEqual({ x: 1920, y: 32, width: 1920, height: 629 })
  })

  it('should land on whole device pixels of the display when the dragged edge falls between them', () => {
    // Arrange
    const window = new FakeDockWindow()
    const scaled: Display = { ...left, scaleFactor: 1.5 }
    const dock = createDockController({
      screen: new FakeScreen([scaled], { x: 300, y: 300 }),
      window,
      scheduler: new FakeScheduler(),
    })
    dock.show()

    // Act
    dock.resizeTo(701)

    // Assert
    expect(window.bounds().height).toBe(700)
  })

  it('should not be pulled back to the old height by the reapply of the last show', () => {
    // Arrange
    const { dock, window, scheduler } = setup({ x: 300, y: 300 })
    dock.show()

    // Act
    dock.resizeTo(800)
    scheduler.advance(250)

    // Assert
    expect(window.bounds().height).toBe(800)
  })

  it('should leave full height and keep the dragged height when the drag ends', () => {
    // Arrange
    const { dock, window } = setup({ x: 300, y: 300 })
    dock.show()
    dock.toggleFullHeight()

    // Act
    dock.resizeTo(700)
    const saved = dock.endResize(true)

    // Assert
    expect(saved).toBe(0.648)
    expect(dock.isFullHeight()).toBe(false)
    expect(window.bounds().height).toBe(700)
  })

  it('should go back to full height and save nothing when the drag is dropped', () => {
    // Arrange
    const { dock, window } = setup({ x: 300, y: 300 })
    dock.show()
    dock.toggleFullHeight()

    // Act
    dock.resizeTo(500)
    dock.resizeTo(400)
    const saved = dock.endResize(false)

    // Assert
    expect(saved).toBeUndefined()
    expect(dock.isFullHeight()).toBe(true)
    expect(window.bounds().height).toBe(1080)
  })

  it('should turn full height on and save nothing when the drag ends at 100%', () => {
    // Arrange
    const { dock, window } = anchoredAt(0.4)
    dock.show()

    // Act
    dock.resizeTo(1075)
    const saved = dock.endResize(true)
    const after = { full: dock.isFullHeight(), height: window.bounds().height }
    dock.toggleFullHeight()

    // Assert
    expect(saved).toBeUndefined()
    expect(after).toEqual({ full: true, height: 1080 })
    expect(window.bounds().height).toBe(432)
  })

  it('should stay at full height when a drag from full height ends at 100%', () => {
    // Arrange
    const { dock, window } = anchoredAt(0.4)
    dock.show()
    dock.toggleFullHeight()

    // Act
    dock.resizeTo(900)
    dock.resizeTo(1080)
    const saved = dock.endResize(true)

    // Assert
    expect(saved).toBeUndefined()
    expect(dock.isFullHeight()).toBe(true)
    expect(window.bounds().height).toBe(1080)
  })

  it('should end nothing when no drag is going on', () => {
    const { dock } = setup()

    expect(dock.endResize(true)).toBeUndefined()
  })
})

describe('fillsHeight', () => {
  it('should fill the height at full height or with an anchored height of 100% and not below it', () => {
    // Arrange
    let ratio = 0.5
    const { window } = setup()
    const dock = createDockController({
      screen: new FakeScreen([left], { x: 300, y: 300 }),
      window,
      scheduler: new FakeScheduler(),
      heightRatio: () => ratio,
    })
    dock.show()

    // Act
    const half = dock.fillsHeight()
    dock.toggleFullHeight()
    const full = dock.fillsHeight()
    dock.toggleFullHeight()
    ratio = 1
    const whole = dock.fillsHeight()

    // Assert
    expect([half, full, whole]).toEqual([false, true, true])
  })
})
