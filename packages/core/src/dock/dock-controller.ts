import type { Cancel, DockWindow, Point, Rectangle, Scheduler, Screen } from '../ports/index.ts'

export interface DockOptions {
  readonly screen: Screen
  readonly window: DockWindow
  readonly scheduler: Scheduler
  // Proporção da altura útil; uma função permite mudar com a janela aberta
  readonly heightRatio?: number | (() => number)
}

export interface DockController {
  toggle(): void
  show(point?: Point): void
  hide(): void
  toggleFullHeight(): void
  // Reaplica a posição e o tamanho atuais, por exemplo depois de mudar a altura nas configurações
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

  const boundsAt = (point: Point) =>
    dockBounds(screen.displayNearest(point).workArea, ratio(), fullHeight)

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

  function placeInPlace() {
    const current = window.bounds()
    window.setBounds(
      boundsAt({ x: current.x + current.width / 2, y: current.y + current.height / 2 }),
    )
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
