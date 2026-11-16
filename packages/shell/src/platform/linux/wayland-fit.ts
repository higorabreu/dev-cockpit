import type { Display, Logger, Point, Rectangle, Screen } from '@dck/core'

export interface PageScreen {
  readonly width: number
  readonly height: number
  // devicePixelRatio: the scale of the monitor the window is drawn on
  readonly scale: number
}

export interface ScaledDisplay extends Display {
  readonly scaleFactor: number
}

export interface WaylandFitDeps {
  // What the page sees of its screen: under native Wayland the size is the primary's, the scale is right
  pageScreen(): Promise<PageScreen | undefined>
  displays(): readonly ScaledDisplay[]
  // Opens the window again, sized for the monitor at this point
  showAt(point: Point): void
  readonly logger?: Logger
}

const center = (rectangle: Rectangle): Point => ({
  x: rectangle.x + rectangle.width / 2,
  y: rectangle.y + rectangle.height / 2,
})

const sameSize = (a: Rectangle, b: Rectangle) => a.width === b.width && a.height === b.height
const sameScale = (a: number, b: number) => Math.abs(a - b) < 0.01

// Native Wayland hides the pointer from apps (it reads as 0,0) and ignores a requested position: the
// compositor puts a shown window on the pointer's monitor. Chromium does not know which one, except
// through its scale, which it needs to draw sharp. So the window opens sized for the monitor it last landed
// on and, when the scale points to a monitor of another size, opens again with that size
export function createWaylandFit(screen: Screen, deps: WaylandFitDeps) {
  let landed: Point | undefined
  let refitting = false

  const fittedScreen: Screen = {
    cursorPoint: () => landed ?? screen.cursorPoint(),
    displayNearest: (point) => screen.displayNearest(point),
  }

  async function onShown() {
    if (refitting) {
      refitting = false
      return
    }
    const page = await deps.pageScreen()
    if (!page) return
    const sized = screen.displayNearest(fittedScreen.cursorPoint())
    const displays = deps.displays()
    const scaled = displays.filter((display) => sameScale(display.scaleFactor, page.scale))
    // Monitors of the same scale are told apart only by size, and the one the window was sized for wins
    const target = scaled.find((display) => sameSize(display.bounds, sized.bounds)) ?? scaled[0]
    deps.logger?.info('wayland fit', {
      page,
      sizedFor: sized.bounds,
      target: target?.bounds,
      displays: displays.map((display) => ({ ...display.bounds, scale: display.scaleFactor })),
    })
    if (!target) return
    landed = center(target.bounds)
    if (sameSize(target.bounds, sized.bounds)) return
    refitting = true
    deps.showAt(landed)
  }

  return { screen: fittedScreen, onShown }
}
