import type { Point, Rectangle, Screen } from '@dck/core'

export interface ScreenApi {
  getCursorScreenPoint(): Point
  getDisplayNearestPoint(point: Point): { id: number; bounds: Rectangle; workArea: Rectangle }
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

// The system work area beats Electron's when the monitor reports it, because the window
// manager shifts a window that goes past it
export function createElectronScreen(
  api: ScreenApi,
  systemWorkAreas: () => readonly Rectangle[] = () => [],
): Screen {
  return {
    cursorPoint: () => api.getCursorScreenPoint(),
    displayNearest(point) {
      const { id, bounds, workArea } = api.getDisplayNearestPoint(point)
      const refined = systemWorkAreas().find((area) => contains(area, center(bounds)))
      return { id: String(id), bounds, workArea: refined ?? workArea }
    },
  }
}
