import type { Display, Point, Rectangle, Screen } from '@dck/core'

export interface ScreenApi {
  getCursorScreenPoint(): Point
  getDisplayNearestPoint(point: Point): {
    id: number
    bounds: Rectangle
    workArea: Rectangle
    scaleFactor: number
  }
}

export type WorkAreaSource = 'electron' | 'gtk' | 'wayland'

// What the dock log needs to tell where a work area came from
export interface SystemDisplay extends Display {
  readonly source: WorkAreaSource
}

export interface SystemScreen extends Screen {
  displayNearest(point: Point): SystemDisplay
}

const center = (rectangle: Rectangle): Point => ({
  x: rectangle.x + rectangle.width / 2,
  y: rectangle.y + rectangle.height / 2,
})

const contains = (rectangle: Rectangle, point: Point) =>
  point.x >= rectangle.x &&
  point.x < rectangle.x + rectangle.width &&
  point.y >= rectangle.y &&
  point.y < rectangle.y + rectangle.height

const inside = (inner: Rectangle, outer: Rectangle) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height

// Rounds the edges, not the size, so a work area that reaches the monitor edge still ends on it
const toDip = (rectangle: Rectangle, scale: number): Rectangle => {
  const x = Math.round(rectangle.x / scale)
  const y = Math.round(rectangle.y / scale)
  return {
    x,
    y,
    width: Math.round((rectangle.x + rectangle.width) / scale) - x,
    height: Math.round((rectangle.y + rectangle.height) / scale) - y,
  }
}

// The system work area beats Electron's when the monitor reports it, because the window
// manager shifts a window that goes past it. The system counts device pixels and Electron DIPs
export function createElectronScreen(
  api: ScreenApi,
  systemWorkAreas: () => readonly Rectangle[] = () => [],
): SystemScreen {
  return {
    cursorPoint: () => api.getCursorScreenPoint(),
    displayNearest(point) {
      const { id, bounds, workArea, scaleFactor } = api.getDisplayNearestPoint(point)
      const refined = systemWorkAreas()
        .map((area) => toDip(area, scaleFactor))
        .find((area) => contains(area, center(bounds)) && inside(area, bounds))
      return {
        id: String(id),
        bounds,
        workArea: refined ?? workArea,
        scaleFactor,
        source: refined ? 'gtk' : 'electron',
      }
    },
  }
}
