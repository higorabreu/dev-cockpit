import type {
  Cancel,
  Clock,
  DockWindow,
  Point,
  Rectangle,
  Scheduler,
  Screen,
} from '../ports/index.ts'

export interface DockOptions {
  readonly screen: Screen
  readonly window: DockWindow
  readonly scheduler: Scheduler
  // Fraction of the usable height; a function lets it change while the window is open
  readonly heightRatio?: number | (() => number)
  // Without it every toggle request counts; with it a repeat right after one is ignored
  readonly clock?: Clock
  // The lowest fraction of the work area a drag of the bottom edge can leave
  readonly minRatio?: number
}

export interface DockController {
  toggle(): void
  show(point?: Point): void
  // Brings a visible window forward where it is, or shows a hidden one. Unlike show it never maps a visible
  // window again: mapped again without the focus, it opens behind the focused app (no always on top on Wayland)
  present(): void
  hide(): void
  toggleFullHeight(): void
  // Reapplies the current position and size, for example after the height changes in settings
  refresh(): void
  isFullHeight(): boolean
  // Whether the window takes the whole height of the screen: at full height or with an anchored height of
  // 100%. The window lays out for the whole screen then, the tab bar on top
  fillsHeight(): boolean
  // The bottom edge dragged to `height` pixels: the window follows at once and leaves full height. Returns
  // the fraction of the work area it takes
  resizeTo(height: number): number
  // The end of a drag: kept, it returns the fraction to save; dropped, the window goes back to how it was
  endResize(keep: boolean): number | undefined
}

const REAPPLY_DELAY_MS = 250
// A held key or a shortcut delivered twice would hide the window and show it again at once
const TOGGLE_REPEAT_MS = 300

// Distance in pixels at which a dragged edge settles on half or the whole of the work area
const SNAP_PX = 12
const SNAP_RATIOS = [0.5, 1] as const

// The fraction of the work area a dragged edge stands for: within the limits and snapped. Kept to a
// thousandth, under a pixel on any screen, so the edge follows the pointer and does not jump on release
export function dragRatio(workAreaHeight: number, height: number, minRatio: number): number {
  const clamped = Math.min(Math.max(height, workAreaHeight * minRatio), workAreaHeight)
  const snap = SNAP_RATIOS.find((ratio) => Math.abs(clamped - workAreaHeight * ratio) <= SNAP_PX)
  return snap ?? Math.round((clamped / workAreaHeight) * 1000) / 1000
}

export function dockBounds(
  workArea: Rectangle,
  heightRatio: number,
  fullHeight: boolean,
): Rectangle {
  return {
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: Math.round(workArea.height * (fullHeight ? 1 : heightRatio)),
  }
}

export function createDockController(options: DockOptions): DockController {
  const { screen, window, scheduler } = options
  // While the edge is dragged, the height it is at; the setting changes only when the drag ends
  let dragged: { ratio: number; wasFullHeight: boolean } | undefined
  const ratio = () => {
    if (dragged) return dragged.ratio
    const value = options.heightRatio
    return typeof value === 'function' ? value() : (value ?? 0.5)
  }
  let fullHeight = false
  let cancelReapply: Cancel | undefined
  // Monitor where the window was shown; reading the window position is unreliable on X11 with several monitors
  let anchor: Point | undefined
  let lastToggleAt: number | undefined

  const boundsAt = (point: Point) =>
    dockBounds(screen.displayNearest(point).workArea, ratio(), fullHeight)

  function show(point: Point = screen.cursorPoint()) {
    cancelReapply?.()
    if (window.isVisible()) window.hide()
    anchor = point
    const bounds = boundsAt(point)
    window.setBounds(bounds)
    window.show()
    // The window manager ignores the requested position before showing when it is the origin (0,0)
    window.setBounds(bounds)
    window.focus()
    cancelReapply = scheduler.after(REAPPLY_DELAY_MS, () => window.setBounds(bounds))
  }

  const here = (): Point => {
    const current = window.bounds()
    return anchor ?? { x: current.x + current.width / 2, y: current.y + current.height / 2 }
  }

  function placeInPlace() {
    cancelReapply?.()
    const bounds = boundsAt(here())
    window.setBounds(bounds)
    // The window manager may move the window afterwards, such as on show
    cancelReapply = scheduler.after(REAPPLY_DELAY_MS, () => window.setBounds(bounds))
  }

  function hide() {
    cancelReapply?.()
    window.hide()
  }

  return {
    show,
    present() {
      if (window.isVisible()) window.focus()
      else show()
    },
    hide,
    toggle() {
      const now = options.clock?.now()
      if (
        now !== undefined &&
        lastToggleAt !== undefined &&
        now - lastToggleAt < TOGGLE_REPEAT_MS
      ) {
        return
      }
      lastToggleAt = now
      if (window.isVisible() && window.isFocused()) hide()
      else show()
    },
    toggleFullHeight() {
      fullHeight = !fullHeight
      placeInPlace()
    },
    refresh() {
      if (window.isVisible()) placeInPlace()
    },
    isFullHeight: () => fullHeight,
    fillsHeight: () => fullHeight || ratio() >= 1,
    resizeTo(height) {
      // A reapply scheduled by the last show would pull the window back to its old height
      cancelReapply?.()
      const { workArea } = screen.displayNearest(here())
      const next = dragRatio(workArea.height, height, options.minRatio ?? 0.3)
      dragged = { ratio: next, wasFullHeight: dragged?.wasFullHeight ?? fullHeight }
      fullHeight = false
      window.setBounds(dockBounds(workArea, next, false))
      return next
    },
    endResize(keep) {
      const ended = dragged
      dragged = undefined
      if (!ended) return undefined
      if (keep) return ended.ratio
      fullHeight = ended.wasFullHeight
      placeInPlace()
      return undefined
    },
  }
}
