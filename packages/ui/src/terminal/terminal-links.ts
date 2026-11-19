import { WebLinksAddon } from '@xterm/addon-web-links'
import type { Terminal } from '@xterm/xterm'
import type { Gesture } from '../kit/keys.ts'
import type { TipBox, TipRegion } from '../kit/tooltip.ts'

export type LinkModifier = 'ctrl' | 'meta'

// 1-based cells, end column included, as xterm reports a link
export interface CellRange {
  readonly start: { readonly x: number; readonly y: number }
  readonly end: { readonly x: number; readonly y: number }
}

export interface ViewportCells {
  readonly viewportY: number
  readonly cols: number
  readonly rows: number
}

export interface LinkHint {
  readonly key: string
  readonly gesture: Gesture
  // A second held click, on its own line: Ctrl+Shift+click on a file path
  readonly alternate?: { readonly key: string; readonly gesture: Gesture }
}

export interface LinkOptions {
  readonly modifier: LinkModifier
  // The modifier and what its left click does, read on every hover: the language can change while the tab is open
  hint(): LinkHint
  open(url: string): void
  tip(owner: HTMLElement, region: TipRegion | undefined): void
}

// A plain click keeps selecting text as before; only the modifier opens the link
export function opensLink(event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>, modifier: LinkModifier) {
  return modifier === 'meta' ? event.metaKey : event.ctrlKey
}

export function linkBox(range: CellRange, view: ViewportCells, screen: TipBox): TipBox {
  const cellWidth = screen.width / view.cols
  const cellHeight = screen.height / view.rows
  const lines = range.end.y - range.start.y + 1
  // A link that wraps spans whole lines; the box only has to cover it
  const [from, to] = lines === 1 ? [range.start.x - 1, range.end.x] : [0, view.cols]
  return {
    x: screen.x + from * cellWidth,
    y: screen.y + (range.start.y - 1 - view.viewportY) * cellHeight,
    width: (to - from) * cellWidth,
    height: lines * cellHeight,
  }
}

type Tip = LinkOptions['tip']

// The tooltip of a link drawn in the terminal sits over its cells, like one over an element
export function showLinkTip(
  terminal: Terminal,
  tip: Tip,
  range: CellRange,
  text: string,
  hint: LinkHint,
  // A file path wraps only after a separator
  path = false,
) {
  const owner = terminal.element
  const screen = owner?.querySelector('.xterm-screen')
  if (!owner || !screen) return
  const view = {
    viewportY: terminal.buffer.active.viewportY,
    cols: terminal.cols,
    rows: terminal.rows,
  }
  const box = linkBox(range, view, screen.getBoundingClientRect())
  tip(owner, { text, ...hint, box, ...(path ? { path } : {}) })
}

export function hideLinkTip(terminal: Terminal, tip: Tip) {
  if (terminal.element) tip(terminal.element, undefined)
}

// Plain addresses (web links addon) and OSC 8 hyperlinks share one activation and one tooltip
export function attachLinks(terminal: Terminal, options: LinkOptions) {
  const activate = (event: MouseEvent, url: string) => {
    if (opensLink(event, options.modifier)) options.open(url)
  }
  // The text of an OSC 8 link may differ from its target: the tooltip shows the target
  const hover = (_event: MouseEvent, url: string, range: CellRange) =>
    showLinkTip(terminal, options.tip, range, url, options.hint())
  const leave = () => hideLinkTip(terminal, options.tip)

  terminal.options.linkHandler = { activate, hover, leave }
  terminal.loadAddon(new WebLinksAddon(activate, { hover, leave }))
}
