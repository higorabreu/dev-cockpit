import type { Display, Logger, Point, Rectangle, Screen } from '@dck/core'

export interface PageScreen {
  readonly width: number
  readonly height: number
}

export interface WaylandFitDeps {
  // The size of the screen the page sees, which follows the monitor the compositor put the window on
  pageScreen(): Promise<PageScreen | undefined>
  displays(): readonly Display[]
  // Opens the window again, sized for the monitor at this point
  showAt(point: Point): void
  readonly logger?: Logger
}

const center = (rectangle: Rectangle): Point => ({
  x: rectangle.x + rectangle.width / 2,
  y: rectangle.y + rectangle.height / 2,
})

const sameSize = (a: PageScreen, b: Rectangle) => a.width === b.width && a.height === b.height

// Native Wayland hides the pointer from apps (it reads as 0,0) and ignores a requested position: the
// compositor puts a shown window on the pointer's monitor. So the window opens sized for the monitor it
// last landed on and, when the compositor chose a monitor of another size, opens again with that size
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
    const target = deps.displays().find((display) => sameSize(page, display.bounds))
    deps.logger?.info('wayland fit', { page, sizedFor: sized.bounds, target: target?.bounds })
    if (!target) return
    landed = center(target.bounds)
    if (sameSize(page, sized.bounds)) return
    refitting = true
    deps.showAt(landed)
  }

  return { screen: fittedScreen, onShown }
}
