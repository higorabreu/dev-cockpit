import type { Point, Rectangle, Screen } from '@dck/core'

export interface ScreenApi {
  getCursorScreenPoint(): Point
  getDisplayNearestPoint(point: Point): { id: number; bounds: Rectangle; workArea: Rectangle }
}

export function createElectronScreen(api: ScreenApi): Screen {
  return {
    cursorPoint: () => api.getCursorScreenPoint(),
    displayNearest(point) {
      const { id, bounds, workArea } = api.getDisplayNearestPoint(point)
      return { id: String(id), bounds, workArea }
    },
  }
}
