import type { Display, Logger, Point, Rectangle, Screen } from '@dck/core'

export interface ScaledDisplay extends Display {
  readonly scaleFactor: number
}

export interface WaylandFitDeps {
  // The page's scale on its first frame after showing: the scale of the monitor it was put on
  frameScale(): Promise<number | undefined>
  // A scale other than this one, if the page sees it change within the time; undefined otherwise
  scaleChange(expected: number, withinMs: number): Promise<number | undefined>
  // The page's content leaves and comes back; the window itself stays transparent behind it
  conceal(): void
  reveal(): void
  displays(): readonly ScaledDisplay[]
  // Opens the window again, sized for the monitor at this point
  showAt(point: Point): void
  readonly logger?: Logger
}

// How long after showing a late scale still moves the window; the log says when it arrived
const LATE_SCALE_MS = 300

const center = (rectangle: Rectangle): Point => ({
  x: rectangle.x + rectangle.width / 2,
  y: rectangle.y + rectangle.height / 2,
})

const sameSize = (a: Rectangle, b: Rectangle) => a.width === b.width && a.height === b.height
const sameScale = (a: number, b: number) => Math.abs(a - b) < 0.01

// Native Wayland hides the pointer from apps (it reads as 0,0) and ignores a requested position: the
// compositor puts a shown window on the pointer's monitor, and Chromium learns which one only through its
// scale. So the window opens with its content hidden, sized for the monitor it last landed on, and shows
// the content once the scale confirms the monitor; another scale means another monitor, and the window opens
// again with that monitor's size before anything is seen
export function createWaylandFit(screen: Screen, deps: WaylandFitDeps) {
  let landed: Point | undefined
  let refitting = false

  const fittedScreen: Screen = {
    cursorPoint: () => landed ?? screen.cursorPoint(),
    displayNearest: (point) => screen.displayNearest(point),
  }

  const scaleOf = (display: Display, displays: readonly ScaledDisplay[]) =>
    displays.find((candidate) => candidate.id === display.id)?.scaleFactor ?? 1

  // The monitor of that scale; among monitors of one scale, the size the window was opened with wins
  function refitTo(scale: number, sized: Display, displays: readonly ScaledDisplay[]) {
    const scaled = displays.filter((display) => sameScale(display.scaleFactor, scale))
    const target = scaled.find((display) => sameSize(display.bounds, sized.bounds)) ?? scaled[0]
    if (!target) return deps.reveal()
    landed = center(target.bounds)
    if (sameSize(target.bounds, sized.bounds)) return deps.reveal()
    refitting = true
    deps.showAt(landed)
  }

  async function onShown() {
    if (refitting) {
      refitting = false
      deps.reveal()
      return
    }
    const displays = deps.displays()
    const sized = screen.displayNearest(fittedScreen.cursorPoint())
    const expected = scaleOf(sized, displays)
    const first = await deps.frameScale()
    deps.logger?.info('wayland fit', { first, expected, sizedFor: sized.bounds })
    if (first === undefined) return deps.reveal()
    if (!sameScale(first, expected)) return refitTo(first, sized, displays)
    deps.reveal()
    const late = await deps.scaleChange(expected, LATE_SCALE_MS)
    if (late === undefined) return
    deps.logger?.info('wayland fit late scale', { late, expected })
    deps.conceal()
    refitTo(late, sized, displays)
  }

  return { screen: fittedScreen, onShown, onHidden: () => deps.conceal() }
}
