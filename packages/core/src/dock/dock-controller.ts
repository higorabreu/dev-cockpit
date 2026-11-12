import type { Cancel, DockWindow, Point, Rectangle, Scheduler, Screen } from '../ports/index.ts'

export interface DockOptions {
  readonly screen: Screen
  readonly window: DockWindow
  readonly scheduler: Scheduler
  // Fraction of the usable height; a function lets it change while the window is open
  readonly heightRatio?: number | (() => number)
}

export interface DockController {
  toggle(): void
  show(point?: Point): void
  hide(): void
  toggleFullHeight(): void
  // Reapplies the current position and size, for example after the height changes in settings
  refresh(): void
  isFullHeight(): boolean
}

const REAPPLY_DELAY_MS = 250

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
  const ratio = () => {
    const value = options.heightRatio
    return typeof value === 'function' ? value() : (value ?? 0.5)
  }
  let fullHeight = false
  let cancelReapply: Cancel | undefined
  // Monitor where the window was shown; reading the window position is unreliable on X11 with several monitors
  let anchor: Point | undefined

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

  function placeInPlace() {
    cancelReapply?.()
    const current = window.bounds()
    const bounds = boundsAt(
      anchor ?? { x: current.x + current.width / 2, y: current.y + current.height / 2 },
    )
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
    hide,
    toggle() {
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
  }
}
