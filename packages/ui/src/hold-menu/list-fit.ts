import { sectorAngle } from '@dck/core'

export const WHEEL_SIZE = 196
// Smallest wheel that keeps its labels at full size; a shorter window scales the whole wheel down
export const COMPACT_WHEEL = 164
// A band shorter than this leaves the full wheel's vertical lists too few rows, so the wheel gets compact
const COMPACT_BELOW = 400
const MIN_WHEEL = 96
// Distance from the wheel's edge to the list
const LIST_GAP = 12
// Height of an overflow cue, as in hold-menu.css
const CUE_HEIGHT = 24

export type Opening = 'side' | 'up' | 'down'

export interface ListAnchor {
  readonly opening: Opening
  // Where the list attaches, in pixels from the wheel's top left corner
  readonly x: number
  readonly y: number
}

// The list opens outside the wheel, in the direction of the selected sector; top and bottom sectors have
// less room, so their list opens vertically
export function listAnchor(index: number, count: number, size = WHEEL_SIZE): ListAnchor {
  const angle = sectorAngle(index, count)
  const cx = Math.cos(angle)
  const cy = Math.sin(angle)
  const reach = size / 2 + LIST_GAP
  let opening: Opening = 'down'
  if (Math.abs(cx) > 0.35) opening = 'side'
  else if (cy < 0) opening = 'up'
  return { opening, x: size / 2 + cx * reach, y: size / 2 + cy * reach }
}

export interface Band {
  readonly top: number
  readonly bottom: number
}

// The band and the window's sides, each already inside the margin the menu keeps from the edges
export interface Room extends Band {
  readonly left: number
  readonly right: number
}

// The window's height free for the menu: the tab bar sits under the terminal, or on top in full screen
export function listBand(
  bar: { readonly top: number; readonly bottom: number; readonly height: number },
  windowHeight: number,
  edge: number,
): Band {
  if (bar.height <= 0) return { top: edge, bottom: windowHeight - edge }
  return bar.top > windowHeight / 2
    ? { top: edge, bottom: bar.top - edge }
    : { top: bar.bottom + edge, bottom: windowHeight - edge }
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
  readonly width: number
}

// Height of the list with every row on screen
const fullHeight = ({ total, rows, height, pitch, cues }: ListMeasure) =>
  height - rows * pitch - cues + total * pitch

// Every row when they all fit, otherwise as many as fit between the cues, and at least one. Without cues on
// screen their height is unknown, so the answer can still overflow by that much; measuring again settles it
export function fitRows(measure: ListMeasure, limit: number): number {
  const { total, rows, height, pitch, cues } = measure
  if (fullHeight(measure) <= limit) return total
  const frame = height - rows * pitch - cues
  const fit = Math.floor((limit - frame - cues) / pitch)
  return Math.max(1, Math.min(total - 1, fit))
}

export interface WheelLayout {
  readonly size: number
  // The wheel's top left corner, in pixels from the window's
  readonly top: number
  readonly left: number
  // How far a vertical list moves onto the wheel, in a window too short for one row of it
  readonly overlap: number
}

// Full size while the band has room for it and its lists, compact below that, and smaller still only when
// the compact wheel itself would not fit
export function wheelSize(band: Band): number {
  const height = band.bottom - band.top
  if (height >= COMPACT_BELOW) return WHEEL_SIZE
  return Math.max(MIN_WHEEL, Math.min(COMPACT_WHEEL, height))
}

export function centeredLayout(room: Room): WheelLayout {
  const size = wheelSize(room)
  const top = (room.top + room.bottom - size) / 2
  return { size, top, left: (room.left + room.right - size) / 2, overlap: 0 }
}

// Centered on the band, moved away from its list only as far as the list needs, and kept inside the band
function wheelTop(anchor: ListAnchor, size: number, band: Band, need: number): number {
  let top = (band.top + band.bottom - size) / 2
  if (anchor.opening === 'up') top = Math.max(top, band.top + need - anchor.y)
  if (anchor.opening === 'down') top = Math.min(top, band.bottom - need - anchor.y)
  return Math.min(Math.max(top, band.top), Math.max(band.top, band.bottom - size))
}

// Centered across the window, moved sideways away from its list only as far as the list's width needs: a
// side list grows away from the wheel, a vertical one is centered on it
function wheelLeft(anchor: ListAnchor, size: number, room: Room, width: number): number {
  let left = (room.left + room.right - size) / 2
  if (anchor.opening === 'side' && anchor.x > size / 2)
    left = Math.min(left, room.right - width - anchor.x)
  else if (anchor.opening === 'side') left = Math.max(left, room.left + width - anchor.x)
  else
    left = Math.min(
      Math.max(left, room.left + width / 2 - anchor.x),
      room.right - width / 2 - anchor.x,
    )
  return Math.min(Math.max(left, room.left), Math.max(room.left, room.right - size))
}

export interface Pin {
  readonly top: number
  readonly left: number
}

export interface Placement {
  readonly layout: WheelLayout
  readonly rows: number
}

// Where the wheel goes and how many rows its list shows. A `pinned` wheel stays where it is, so it never
// slides out from under the pointer; the list then fits the room it has there
export function placeWheel(
  index: number,
  count: number,
  room: Room,
  measure: ListMeasure,
  pinned?: Pin,
): Placement {
  const size = wheelSize(room)
  const need = fullHeight(measure)
  const anchor = listAnchor(index, count, size)
  const top = pinned?.top ?? wheelTop(anchor, size, room, need)
  const left = pinned?.left ?? wheelLeft(anchor, size, room, measure.width)
  const limit = listLimit(anchor.opening, top + anchor.y, room)
  const rows = fitRows(measure, limit)
  // The list stays in its sector's direction and inside the window: with no room for one row between the
  // cues, it covers part of the wheel instead
  const { height, pitch, cues } = measure
  const smallest = Math.min(need, height - measure.rows * pitch - cues + pitch + 2 * CUE_HEIGHT)
  const overlap = anchor.opening === 'side' ? 0 : Math.max(0, smallest - limit)
  return { layout: { size, top, left, overlap }, rows }
}
