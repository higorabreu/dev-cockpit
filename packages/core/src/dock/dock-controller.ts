import type { Cancel, DockWindow, Point, Rectangle, Scheduler, Screen } from '../ports/index.ts'

export interface DockOptions {
  readonly screen: Screen
  readonly window: DockWindow
  readonly scheduler: Scheduler
  readonly heightRatio?: number
}

export interface DockController {
  toggle(): void
  show(point?: Point): void
  hide(): void
  toggleFullHeight(): void
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
  const heightRatio = options.heightRatio ?? 0.5
  let fullHeight = false
  let cancelReapply: Cancel | undefined

  const boundsAt = (point: Point) =>
    dockBounds(screen.displayNearest(point).workArea, heightRatio, fullHeight)

  function show(point: Point = screen.cursorPoint()) {
    cancelReapply?.()
    if (window.isVisible()) window.hide()
    const bounds = boundsAt(point)
    window.setBounds(bounds)
    window.show()
    // O gerenciador de janelas ignora a posição pedida antes de mostrar quando ela é a origem (0,0)
    window.setBounds(bounds)
    window.focus()
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
      const current = window.bounds()
      window.setBounds(
        boundsAt({ x: current.x + current.width / 2, y: current.y + current.height / 2 }),
      )
    },
    isFullHeight: () => fullHeight,
  }
}
