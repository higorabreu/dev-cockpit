import { sectorAngle } from '@dck/core'

export const WHEEL_SIZE = 196
// Distance from the wheel's edge to the list
const LIST_GAP = 12

export type Opening = 'side' | 'up' | 'down'

export interface ListAnchor {
  readonly opening: Opening
  // Where the list attaches, in pixels from the wheel's top left corner
  readonly x: number
  readonly y: number
}

// The list opens outside the wheel, in the direction of the selected sector; top and bottom sectors have
// less room, so their list opens vertically
export function listAnchor(index: number, count: number): ListAnchor {
  const angle = sectorAngle(index, count)
  const cx = Math.cos(angle)
  const cy = Math.sin(angle)
  const reach = WHEEL_SIZE / 2 + LIST_GAP
  let opening: Opening = 'down'
  if (Math.abs(cx) > 0.35) opening = 'side'
  else if (cy < 0) opening = 'up'
  return { opening, x: WHEEL_SIZE / 2 + cx * reach, y: WHEEL_SIZE / 2 + cy * reach }
}

export interface Band {
  readonly top: number
  readonly bottom: number
}

// Tallest list that stays inside the band: a side list is centered on its anchor, the others grow away
export function listLimit(opening: Opening, anchorY: number, band: Band): number {
  if (opening === 'up') return anchorY - band.top
  if (opening === 'down') return band.bottom - anchorY
  return 2 * Math.min(anchorY - band.top, band.bottom - anchorY)
}

export interface RowWindow {
  readonly start: number
  readonly size: number
}

// Moves the window only as far as it takes to keep the selected row in it, as a scrolled list does
export function followSelection(
  total: number,
  selected: number,
  rows: number,
  start = 0,
): RowWindow {
  const size = Math.max(0, Math.min(total, rows))
  const next = Math.min(Math.max(start, selected - size + 1), selected, total - size)
  return { start: Math.max(0, next), size }
}

export interface ListMeasure {
  readonly total: number
  // Rows on screen when measured, and the list's height then
  readonly rows: number
  readonly height: number
  // From one row's top to the next one's
  readonly pitch: number
  // Height of the overflow cues on screen, zero when the list was not windowed
  readonly cues: number
}

// Every row when they all fit, otherwise as many as fit between the cues, and at least one. Without cues on
// screen their height is unknown, so the answer can still overflow by that much; measuring again settles it
export function fitRows(measure: ListMeasure, limit: number): number {
  const { total, rows, height, pitch, cues } = measure
  const frame = height - rows * pitch - cues
  if (frame + total * pitch <= limit) return total
  const fit = Math.floor((limit - frame - cues) / pitch)
  return Math.max(1, Math.min(total - 1, fit))
}
