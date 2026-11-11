import type { Rectangle } from './screen.ts'

export interface DockWindow {
  isVisible(): boolean
  isFocused(): boolean
  bounds(): Rectangle
  setBounds(bounds: Rectangle): void
  show(): void
  hide(): void
  focus(): void
}
