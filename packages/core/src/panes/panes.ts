// What a pane of a tab shows; a second terminal is a new kind here, not a new model
export type PaneKind = 'terminal' | 'review'

export interface Pane {
  readonly id: string
  readonly kind: PaneKind
}

// Two panes sit side by side (left and right) or stacked (top and bottom)
export type Orientation = 'side' | 'stacked'

// What the user asked for: the tab's shape decides, or always one orientation while it fits
export const SPLIT_PREFERENCES = ['auto', 'side', 'stacked'] as const
export type SplitPreference = (typeof SPLIT_PREFERENCES)[number]

// The panes of one tab, in order; the first one is the tab's own terminal, on the left or on top
export interface PaneLayout {
  readonly panes: readonly Pane[]
  // Share of the width (side) or of the height (stacked) the first pane takes while two are shown
  readonly ratios: Readonly<Record<Orientation, number>>
  readonly focused: string
}

export const MAX_PANES = 2
export const PANE_RATIO = { min: 0.2, max: 0.8, initial: 0.5 } as const
// Below these, side by side is not readable
export const PANE_MIN_WIDTH: Readonly<Record<PaneKind, number>> = { terminal: 360, review: 440 }
// Auto puts the panes side by side only when each keeps this many columns of its text
export const AUTO_SIDE_COLUMNS = 100
// Stacked, each pane keeps at least this many rows of its text
export const MIN_STACKED_ROWS = 15

// The text grid of a pane in pixels: one cell, and what surrounds the cells (padding, gutters, a header)
export interface PaneGrid {
  readonly cellWidth: number
  readonly cellHeight: number
  readonly frameWidth: number
  readonly frameHeight: number
}

// The tab's area in pixels, the divider between two panes and the grid of each kind of pane
export interface TabShape {
  readonly width: number
  readonly height: number
  readonly divider: number
  readonly grids: Readonly<Record<PaneKind, PaneGrid>>
}

export interface PaneArrangement {
  // The panes on screen in order, with their width (side) or height (stacked) in pixels; a pane alone
  // takes the whole tab
  readonly visible: readonly { readonly id: string; readonly size: number }[]
  // How two panes are shown, or undefined when only one is
  readonly orientation: Orientation | undefined
  // Two panes exist but only the focused one fits
  readonly narrow: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const has = (layout: PaneLayout, id: string) => layout.panes.some((pane) => pane.id === id)

const initialRatios = { side: PANE_RATIO.initial, stacked: PANE_RATIO.initial } as const

export function singlePane(
  pane: Pane,
  ratios: Readonly<Record<Orientation, number>> = initialRatios,
): PaneLayout {
  return { panes: [pane], ratios, focused: pane.id }
}

// The new pane goes after the terminal and takes the focus; one already there only takes the focus
export function addPane(layout: PaneLayout, pane: Pane): PaneLayout {
  if (has(layout, pane.id)) return focusPane(layout, pane.id)
  if (layout.panes.length >= MAX_PANES) return layout
  return { ...layout, panes: [...layout.panes, pane], focused: pane.id }
}

// The first pane is the tab itself and never closes; the focus falls to the pane before
export function removePane(layout: PaneLayout, id: string): PaneLayout {
  const index = layout.panes.findIndex((pane) => pane.id === id)
  if (index <= 0) return layout
  const panes = layout.panes.filter((pane) => pane.id !== id)
  const focused = layout.focused === id ? (panes[index - 1]?.id ?? panes[0]?.id) : layout.focused
  return { ...layout, panes, focused: focused ?? layout.focused }
}

export function focusPane(layout: PaneLayout, id: string): PaneLayout {
  return has(layout, id) && layout.focused !== id ? { ...layout, focused: id } : layout
}

export const paneOfKind = (layout: PaneLayout, kind: PaneKind): Pane | undefined =>
  layout.panes.find((pane) => pane.kind === kind)

export const clampRatio = (ratio: number) =>
  Math.round(clamp(ratio, PANE_RATIO.min, PANE_RATIO.max) * 1000) / 1000

export function setPaneRatio(
  layout: PaneLayout,
  orientation: Orientation,
  ratio: number,
): PaneLayout {
  if (!Number.isFinite(ratio)) return layout
  const next = clampRatio(ratio)
  return next === layout.ratios[orientation]
    ? layout
    : { ...layout, ratios: { ...layout.ratios, [orientation]: next } }
}

const rowsHeight = (grid: PaneGrid, rows: number) => grid.frameHeight + rows * grid.cellHeight
const columnsWidth = (grid: PaneGrid, columns: number) => grid.frameWidth + columns * grid.cellWidth

// The least a pane of this kind can take along the split: a width side by side, rows when stacked
export function paneMinimum(kind: PaneKind, orientation: Orientation, shape: TabShape): number {
  return orientation === 'side'
    ? PANE_MIN_WIDTH[kind]
    : Math.ceil(rowsHeight(shape.grids[kind], MIN_STACKED_ROWS))
}

// Whether both panes keep their minimum in this orientation; stacked, each also needs a usable width
export function orientationFits(
  orientation: Orientation,
  kinds: readonly [PaneKind, PaneKind],
  shape: TabShape,
): boolean {
  const [first, second] = kinds
  const length = (orientation === 'side' ? shape.width : shape.height) - shape.divider
  const room =
    length >= paneMinimum(first, orientation, shape) + paneMinimum(second, orientation, shape)
  if (orientation === 'side') return room
  return room && shape.width >= Math.max(PANE_MIN_WIDTH[first], PANE_MIN_WIDTH[second])
}

// Auto: side by side while each pane keeps about 100 columns, else stacked while each keeps 15 rows.
// A chosen orientation stays while it fits its minimums. Undefined: only one pane fits the tab
export function chooseOrientation(
  preference: SplitPreference,
  kinds: readonly [PaneKind, PaneKind],
  shape: TabShape,
): Orientation | undefined {
  if (preference !== 'auto') {
    return orientationFits(preference, kinds, shape) ? preference : undefined
  }
  const roomy =
    shape.divider +
    columnsWidth(shape.grids[kinds[0]], AUTO_SIDE_COLUMNS) +
    columnsWidth(shape.grids[kinds[1]], AUTO_SIDE_COLUMNS)
  if (shape.width >= roomy && orientationFits('side', kinds, shape)) return 'side'
  if (orientationFits('stacked', kinds, shape)) return 'stacked'
  return undefined
}

// Sizes for a tab of this shape: the orientation the preference and the shape give, split by that
// orientation's ratio with each pane keeping its minimum; when neither fits only the focused pane shows
export function arrangePanes(
  layout: PaneLayout,
  shape: TabShape,
  preference: SplitPreference,
): PaneArrangement {
  const [first, second] = layout.panes
  if (first === undefined) return { visible: [], orientation: undefined, narrow: false }
  if (second === undefined) {
    return { visible: [{ id: first.id, size: shape.width }], orientation: undefined, narrow: false }
  }
  const orientation = chooseOrientation(preference, [first.kind, second.kind], shape)
  if (orientation === undefined) {
    return { visible: [{ id: layout.focused, size: shape.width }], orientation, narrow: true }
  }
  const room = (orientation === 'side' ? shape.width : shape.height) - shape.divider
  const firstSize = clamp(
    Math.round(room * layout.ratios[orientation]),
    paneMinimum(first.kind, orientation, shape),
    room - paneMinimum(second.kind, orientation, shape),
  )
  return {
    visible: [
      { id: first.id, size: firstSize },
      { id: second.id, size: room - firstSize },
    ],
    orientation,
    narrow: false,
  }
}
