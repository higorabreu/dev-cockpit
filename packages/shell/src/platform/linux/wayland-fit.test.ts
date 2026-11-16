import type { Point, Screen } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createWaylandFit, type ScaledDisplay } from './wayland-fit.ts'

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

// Two 1920x1080 monitors at 100% and a 1920x1200 laptop at 150% on the right, as on the maintainer's desk
const DISPLAYS = [
  display('left', 0, 1920, 1080, 1),
  display('center', 1920, 1920, 1080, 1),
  display('laptop', 3840, 1280, 800, 1.5),
]

// Each show reports the page's scale on its first frame and, optionally, a scale that arrives later
interface Show {
  readonly first: number
  readonly late?: number
}

function setup(shows: readonly Show[]) {
  const nearest = (point: Point) =>
    DISPLAYS.find((d) => point.x >= d.bounds.x && point.x < d.bounds.x + d.bounds.width) ??
    (DISPLAYS[0] as ScaledDisplay)
  // Native Wayland reads the pointer as the origin
  const screen: Screen = { cursorPoint: () => ({ x: 0, y: 0 }), displayNearest: nearest }
  const events: string[] = []
  let show = -1
  const fit = createWaylandFit(screen, {
    frameScale: async () => shows[++show]?.first,
    scaleChange: async () => shows[show]?.late,
    conceal: () => void events.push('conceal'),
    reveal: () => void events.push('reveal'),
    displays: () => DISPLAYS,
    showAt: (point) => void events.push(`show on ${nearest(point).id}`),
  })
  return { fit, events, nearest }
}

describe('createWaylandFit', () => {
  it('should reveal the window at once when it lands on a monitor of the scale it was sized for', async () => {
    const { fit, events } = setup([{ first: 1 }])

    await fit.onShown()

    expect(events).toEqual(['reveal'])
  })

  it('should open again sized for the laptop before revealing when the first frame has its scale', async () => {
    const { fit, events } = setup([{ first: 1.5 }])

    await fit.onShown()
    await fit.onShown()

    expect(events).toEqual(['show on laptop', 'reveal'])
  })

  it('should hide the content again and move when the laptop scale arrives after the reveal', async () => {
    const { fit, events } = setup([{ first: 1, late: 1.5 }])

    await fit.onShown()

    expect(events).toEqual(['reveal', 'conceal', 'show on laptop'])
  })

  it('should size the next show for the monitor it last landed on', async () => {
    const { fit, nearest } = setup([{ first: 1.5 }])

    await fit.onShown()

    expect(nearest(fit.screen.cursorPoint()).id).toBe('laptop')
  })

  it('should open again sized for a 1920 monitor when it leaves the laptop for one', async () => {
    const { fit, events } = setup([{ first: 1.5 }, { first: 1 }])

    await fit.onShown()
    await fit.onShown()
    await fit.onShown()

    expect(events).toEqual(['show on laptop', 'reveal', 'show on left'])
  })

  it('should hide the content when the window hides so the next show starts unseen', () => {
    const { fit, events } = setup([])

    fit.onHidden()

    expect(events).toEqual(['conceal'])
  })
})
