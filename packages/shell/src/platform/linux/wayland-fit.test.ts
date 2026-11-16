import type { Point, Screen } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createWaylandFit, type PageScreen, type ScaledDisplay } from './wayland-fit.ts'

const display = (
  id: string,
  x: number,
  width: number,
  height: number,
  scaleFactor: number,
): ScaledDisplay => ({
  id,
  bounds: { x, y: 0, width, height },
  workArea: { x, y: 32, width, height: height - 32 },
  scaleFactor,
})

// Two 1920x1080 monitors at 100% and a 1920x1200 laptop at 125% on the right, as on the maintainer's desk
const DISPLAYS = [
  display('left', 0, 1920, 1080, 1),
  display('center', 1920, 1920, 1080, 1),
  display('laptop', 3840, 1536, 960, 1.25),
]
// Under native Wayland the page reads the primary's size wherever it is; only the scale follows it
const ON_LAPTOP: PageScreen = { width: 1920, height: 1080, scale: 1.25 }
const ON_MONITOR: PageScreen = { width: 1920, height: 1080, scale: 1 }

function setup(pages: readonly PageScreen[]) {
  const nearest = (point: Point) =>
    DISPLAYS.find((d) => point.x >= d.bounds.x && point.x < d.bounds.x + d.bounds.width) ??
    (DISPLAYS[1] as ScaledDisplay)
  // Native Wayland reads the pointer as the origin
  const screen: Screen = { cursorPoint: () => ({ x: 0, y: 0 }), displayNearest: nearest }
  const shownAt: Point[] = []
  let page = 0
  const fit = createWaylandFit(screen, {
    pageScreen: async () => pages[page++],
    displays: () => DISPLAYS,
    showAt: (point) => void shownAt.push(point),
  })
  return { fit, shownAt, nearest }
}

describe('createWaylandFit', () => {
  it('should open again sized for the laptop when the compositor puts the window on it', async () => {
    const { fit, shownAt, nearest } = setup([ON_LAPTOP])

    await fit.onShown()

    expect(shownAt.map((point) => nearest(point).id)).toEqual(['laptop'])
  })

  it('should keep the window when it lands on a monitor of the size it was opened with', async () => {
    const { fit, shownAt } = setup([ON_MONITOR])

    await fit.onShown()

    expect(shownAt).toEqual([])
  })

  it('should open the next time with the size of the monitor it last landed on', async () => {
    const { fit, nearest } = setup([ON_LAPTOP])

    await fit.onShown()
    await fit.onShown()

    expect(nearest(fit.screen.cursorPoint()).id).toBe('laptop')
  })

  it('should not open again in a loop when the reopened window reports its show', async () => {
    const { fit, shownAt } = setup([ON_LAPTOP, ON_LAPTOP])

    await fit.onShown()
    await fit.onShown()

    expect(shownAt).toHaveLength(1)
  })

  it('should open again sized for a 1920 monitor when it leaves the laptop for one', async () => {
    const { fit, shownAt, nearest } = setup([ON_LAPTOP, ON_MONITOR])

    await fit.onShown()
    await fit.onShown()
    await fit.onShown()

    expect(shownAt.map((point) => nearest(point).bounds.width)).toEqual([1536, 1920])
  })
})
