// What a pane of a tab shows; a second terminal is a new kind here, not a new model
export type PaneKind = 'terminal' | 'review'

export interface Pane {
  readonly id: string
  readonly kind: PaneKind
}

// The panes of one tab, side by side from left to right; the first one is the tab's own terminal
export interface PaneLayout {
  readonly panes: readonly Pane[]
  // Share of the width the first pane takes while two are shown
  readonly ratio: number
  readonly focused: string
}

export const MAX_PANES = 2
export const PANE_RATIO = { min: 0.2, max: 0.8, initial: 0.5 } as const
// Below these the pair is not readable, so the focused pane takes the whole tab
export const PANE_MIN_WIDTH: Readonly<Record<PaneKind, number>> = { terminal: 360, review: 440 }

export interface PaneArrangement {
  // The panes on screen, left to right, with their width in pixels
  readonly visible: readonly { readonly id: string; readonly width: number }[]
  // Two panes exist but only the focused one fits
  readonly narrow: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const has = (layout: PaneLayout, id: string) => layout.panes.some((pane) => pane.id === id)

export function singlePane(pane: Pane): PaneLayout {
  return { panes: [pane], ratio: PANE_RATIO.initial, focused: pane.id }
}

// The new pane goes to the right and takes the focus; one already there only takes the focus
export function addPane(layout: PaneLayout, pane: Pane): PaneLayout {
  if (has(layout, pane.id)) return focusPane(layout, pane.id)
  if (layout.panes.length >= MAX_PANES) return layout
  return { ...layout, panes: [...layout.panes, pane], focused: pane.id }
}

// The first pane is the tab itself and never closes; the focus falls to the pane on the left
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

export function setPaneRatio(layout: PaneLayout, ratio: number): PaneLayout {
  if (!Number.isFinite(ratio)) return layout
  const next = Math.round(clamp(ratio, PANE_RATIO.min, PANE_RATIO.max) * 1000) / 1000
  return next === layout.ratio ? layout : { ...layout, ratio: next }
}

// Widths for a tab `width` pixels wide with a `divider` between two panes; each keeps its minimum
// while both fit, and below that only the focused pane is shown
export function arrangePanes(layout: PaneLayout, width: number, divider: number): PaneArrangement {
  const [first, second] = layout.panes
  if (first === undefined) return { visible: [], narrow: false }
  if (second === undefined) return { visible: [{ id: first.id, width }], narrow: false }
  const room = width - divider
  const firstMin = PANE_MIN_WIDTH[first.kind]
  const secondMin = PANE_MIN_WIDTH[second.kind]
  if (room < firstMin + secondMin) {
    return { visible: [{ id: layout.focused, width }], narrow: true }
  }
  const firstWidth = clamp(Math.round(room * layout.ratio), firstMin, room - secondMin)
  return {
    visible: [
      { id: first.id, width: firstWidth },
      { id: second.id, width: room - firstWidth },
    ],
    narrow: false,
  }
}
