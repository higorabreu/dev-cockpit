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
  // Switches full height. Leaving it, or pressing it at an anchored height of 100% that looks the same, lands
  // on half the screen when the anchored height is 100%, and returns that fraction for the caller to save
  toggleFullHeight(): number | undefined
  // Reapplies the current position and size, for example after the height changes in settings
  refresh(): void
  isFullHeight(): boolean
  // Whether the window takes the whole height of the screen: at full height or with an anchored height of
  // 100%. The window lays out for the whole screen then, the tab bar on top
  fillsHeight(): boolean
  // The bottom edge dragged to `height` pixels: the window follows at once and leaves full height. Returns
  // the fraction of the work area it takes
  resizeTo(height: number): number
  // The end of a drag: kept, it returns the fraction to save, or nothing when released at 100%, which turns
  // full height on and leaves the anchored height as it was; dropped, the window goes back to how it was
  endResize(keep: boolean): number | undefined
}

const REAPPLY_DELAY_MS = 250
// A held key or a shortcut delivered twice would hide the window and show it again at once
const TOGGLE_REPEAT_MS = 300

// Distance in pixels at which a dragged edge settles on half or the whole of the work area
const SNAP_PX = 12
const SNAP_RATIOS = [0.5, 1] as const
// Where leaving full height lands when the anchored height is the whole screen, which would change nothing
const LEAVE_RATIO = 0.5

// The fraction of the work area a dragged edge stands for: within the limits and snapped. Kept to a
// thousandth, under a pixel on any screen, so the edge follows the pointer and does not jump on release
export function dragRatio(workAreaHeight: number, height: number, minRatio: number): number {
  const clamped = Math.min(Math.max(height, workAreaHeight * minRatio), workAreaHeight)
  const snap = SNAP_RATIOS.find((ratio) => Math.abs(clamped - workAreaHeight * ratio) <= SNAP_PX)
  return snap ?? Math.round((clamped / workAreaHeight) * 1000) / 1000
}

// Steps tried around a height, nearest first and the shorter one first, until one is whole device pixels
const DEVICE_STEPS = [0, -1, 1, -2, 2, -3, 3, -4, 4]

// The height nearest `height` that is a whole number of device pixels at `scale`, never past `limit`. At
// 125% a window of 557 DIPs is 696.25 pixels: the compositor stretches its 697 to fit and every 1px line
// lands across two pixels, more so toward the bottom. A scale with no such height nearby keeps it
export function deviceHeight(height: number, scale: number, limit: number): number {
  const fits = (candidate: number) => {
    const pixels = candidate * scale
    return candidate >= 1 && candidate <= limit && Math.abs(pixels - Math.round(pixels)) < 0.001
  }
  return DEVICE_STEPS.map((step) => height + step).find(fits) ?? height
}

export function dockBounds(
  workArea: Rectangle,
  heightRatio: number,
  fullHeight: boolean,
  scale = 1,
): Rectangle {
  const wanted = Math.round(workArea.height * (fullHeight ? 1 : heightRatio))
  return {
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    // The whole work area ends where the system says; only a part of it can move to a whole pixel
    height: wanted >= workArea.height ? wanted : deviceHeight(wanted, scale, workArea.height),
  }
}

export function createDockController(options: DockOptions): DockController {
  const { screen, window, scheduler } = options
  // While the edge is dragged, the height it is at; the setting changes only when the drag ends
  let dragged: { ratio: number; wasFullHeight: boolean } | undefined
  // The height leaving full height took in place of an anchored 100%, until the caller saves it
  let leftTo: number | undefined
  const ratio = () => {
    if (dragged) return dragged.ratio
    if (leftTo !== undefined) return leftTo
    const value = options.heightRatio
    return typeof value === 'function' ? value() : (value ?? 0.5)
  }
  let fullHeight = false
  let cancelReapply: Cancel | undefined
  // Monitor where the window was shown; reading the window position is unreliable on X11 with several monitors
  let anchor: Point | undefined
  let lastToggleAt: number | undefined

  const boundsAt = (point: Point) => {
    const display = screen.displayNearest(point)
    return dockBounds(display.workArea, ratio(), fullHeight, display.scaleFactor)
  }

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
      const anchoredWhole = ratio() >= 1
      const leaving = fullHeight || anchoredWhole
      fullHeight = !leaving
      if (leaving && anchoredWhole) leftTo = LEAVE_RATIO
      placeInPlace()
      return leaving && anchoredWhole ? LEAVE_RATIO : undefined
    },
    refresh() {
      // The saved height replaces the one leaving full height took
      leftTo = undefined
      if (window.isVisible()) placeInPlace()
    },
    isFullHeight: () => fullHeight,
    fillsHeight: () => fullHeight || ratio() >= 1,
    resizeTo(height) {
      // A reapply scheduled by the last show would pull the window back to its old height
      cancelReapply?.()
      const { workArea, scaleFactor } = screen.displayNearest(here())
      const next = dragRatio(workArea.height, height, options.minRatio ?? 0.3)
      dragged = { ratio: next, wasFullHeight: dragged?.wasFullHeight ?? fullHeight }
      fullHeight = false
      window.setBounds(dockBounds(workArea, next, false, scaleFactor))
      return next
    },
    endResize(keep) {
      const ended = dragged
      dragged = undefined
      if (!ended) return undefined
      if (keep && ended.ratio < 1) {
        leftTo = undefined
        return ended.ratio
      }
      fullHeight = keep || ended.wasFullHeight
      placeInPlace()
      return undefined
    },
  }
}
