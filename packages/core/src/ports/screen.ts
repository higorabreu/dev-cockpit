export interface Point {
  readonly x: number
  readonly y: number
}

export interface Rectangle extends Point {
  readonly width: number
  readonly height: number
}

export interface Display {
  readonly id: string
  readonly bounds: Rectangle
  readonly workArea: Rectangle
}

export interface Screen {
  cursorPoint(): Point
  displayNearest(point: Point): Display
}
