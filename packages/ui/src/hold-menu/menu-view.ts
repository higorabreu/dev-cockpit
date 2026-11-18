import {
  CENTER,
  currentCategory,
  type HoldMenuState,
  type MenuCategory,
  sectorAngle,
  selectedIndex,
  type Translate,
} from '@dck/core'
import { keysMarkup } from '../kit/keys.ts'
import {
  COMPACT_WHEEL,
  listAnchor,
  type RowWindow,
  WHEEL_SIZE,
  type WheelLayout,
} from './list-fit.ts'

const PATHS: Record<string, string> = {
  window: 'M4 6h16v12H4zM4 10h16',
  folder: 'M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  terminal: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4',
}

const ICON_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'

const IDENTITY_PATH =
  'M20 64C20 38 36 22 56 22C73 22 84 33 84 48L84 64C84 71 79 76 72 76L32 76C25 76 20 71 20 64ZM46 44H80V60C80 64 77 67 73 67H52C48.7 67 46 64.3 46 61Z'

// Radii of the hub, the sectors and the labels' centers; the compact wheel keeps the text at full size
interface Geometry {
  readonly size: number
  readonly inner: number
  readonly outer: number
  readonly label: number
}
const FULL: Geometry = { size: WHEEL_SIZE, inner: 38, outer: 96, label: 68 }
const COMPACT: Geometry = { size: COMPACT_WHEEL, inner: 26, outer: 80, label: 52 }
const GAP = 4
const CENTERED: WheelLayout = { size: WHEEL_SIZE, top: 0, left: 0, overlap: 0 }

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ENTITIES[char] ?? char)
const fixed = (value: number) => value.toFixed(1)
const point = (radius: number, angle: number) =>
  [Math.cos(angle) * radius, Math.sin(angle) * radius] as const

// Each radial edge is shifted inward from the sector, leaving a constant-width gap
function sectorPath(index: number, count: number, geometry: Geometry) {
  const step = (2 * Math.PI) / count
  const start = sectorAngle(index, count) - step / 2
  const end = start + step
  const half = GAP / 2
  const edge = (angle: number, radius: number, side: number) => {
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    return `${fixed(ux * radius - uy * half * side)} ${fixed(uy * radius + ux * half * side)}`
  }
  const { inner, outer } = geometry
  const outerArc = fixed(Math.hypot(outer, half))
  const innerArc = fixed(Math.hypot(inner, half))
  return `M${edge(start, outer, 1)} A${outerArc} ${outerArc} 0 0 1 ${edge(end, outer, -1)} L${edge(end, inner, -1)} A${innerArc} ${innerArc} 0 0 0 ${edge(start, inner, 1)}Z`
}

function fanStyle(index: number, count: number, layout: WheelLayout) {
  const { opening, x, y } = listAnchor(index, count, layout.size)
  let shift = 'translate(-50%, 0)'
  if (opening === 'side')
    shift = x > layout.size / 2 ? 'translate(0, -50%)' : 'translate(-100%, -50%)'
  else if (opening === 'up') shift = 'translate(-50%, -100%)'
  const top = opening === 'up' ? y + layout.overlap : y - layout.overlap
  return `left:${fixed(x)}px;top:${fixed(top)}px;transform:${shift}`
}

const CHEVRONS = { before: 'M4 10l4-4 4 4', after: 'M4 6l4 4 4-4' }
const CHEVRON_ATTRS =
  'width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'

// An empty cue keeps its slot, so the list does not change height as the window moves. A click on a cue
// selects the nearest hidden row on its side
function cueMarkup(side: 'before' | 'after', hidden: number, reveal: number, t: Translate) {
  if (hidden === 0) return `<span class="cue" aria-hidden="true"></span>`
  const label = escapeHtml(t(`menu.more.${side}`, { count: hidden }))
  return `<button type="button" class="cue" tabindex="-1" data-reveal="${reveal}" data-tip="${label}" aria-label="${label}"><svg ${CHEVRON_ATTRS}><path d="${CHEVRONS[side]}"/></svg></button>`
}

// Rows outside the window stay in the list without height, so its width follows the longest label and does
// not jump while the window moves
function listMarkup(
  category: MenuCategory,
  selected: number,
  shown: RowWindow | undefined,
  t: Translate,
) {
  const total = category.items.length
  if (total === 0) return `<div class="empty">${escapeHtml(t('menu.empty'))}</div>`
  const first = Math.max(0, shown?.start ?? 0)
  const last = Math.min(total, first + (shown?.size ?? total)) - 1
  const items = category.items
    .map((item, index) => {
      const content = `<span class="l">${escapeHtml(item.label)}</span><span class="k">${item.shortcut ? keysMarkup(item.shortcut, 'compact') : ''}</span>`
      if (index < first || index > last)
        return `<button type="button" class="it gone" tabindex="-1">${content}</button>`
      return `<button type="button" class="it${index === selected ? ' on' : ''}" data-item="${index}">${content}</button>`
    })
    .join('')
  if (first === 0 && last === total - 1) return items
  return `${cueMarkup('before', first, first - 1, t)}${items}${cueMarkup('after', total - 1 - last, last + 1, t)}`
}

const kbd = (keys: readonly string[]) => keysMarkup(keys.join(' '), 'compact')

export interface MenuMarkup {
  readonly mode: 'wheel-mode'
  readonly card: string
  readonly hint: string
}

// Shows the selected category's rows inside `shown`, or all of them; the rest sits behind overflow cues
export function wheelMarkup(
  state: HoldMenuState,
  t: Translate,
  shown?: RowWindow,
  layout = CENTERED,
): MenuMarkup {
  const count = state.categories.length
  const category = currentCategory(state)
  // Below the compact size the compact drawing scales down with the wheel
  const geometry = layout.size >= WHEEL_SIZE ? FULL : COMPACT
  const half = geometry.size / 2
  const sectors = state.categories
    .map((entry, index) => {
      const [x, y] = point(geometry.label, sectorAngle(index, count))
      const on = index === state.category ? ' on' : ''
      return `<g class="sec${on}" data-category="${index}"><path d="${sectorPath(index, count, geometry)}"/><svg class="glyph" x="${fixed(x - 10)}" y="${fixed(y - 19)}" width="20" height="20" ${ICON_ATTRS}><path d="${PATHS[entry.icon] ?? ''}"/></svg><text x="${fixed(x)}" y="${fixed(y + 17)}">${escapeHtml(entry.label)}</text></g>`
    })
    .join('')
  const hub = category
    ? `<svg x="-9" y="-16" width="18" height="18" ${ICON_ATTRS} style="color:var(--fg)"><path d="${PATHS[category.icon] ?? ''}"/></svg><text class="hubt" y="14">${escapeHtml(t('menu.hub.count', { index: selectedIndex(state) + 1, total: category.items.length }))}</text>`
    : `<svg x="-20" y="-20" width="40" height="40" viewBox="0 0 100 100" aria-hidden="true" style="color:var(--muted)"><path fill="currentColor" fill-rule="evenodd" d="${IDENTITY_PATH}"/><path d="M54 50 59 55.5 54 61M63 61H72" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  const list =
    state.category === CENTER
      ? ''
      : `<div class="list fan" style="${fanStyle(state.category, count, layout)}">${category ? listMarkup(category, selectedIndex(state), shown, t) : ''}</div>`
  return {
    mode: 'wheel-mode',
    card: `<svg class="wheel" width="${fixed(layout.size)}" height="${fixed(layout.size)}" viewBox="${-half} ${-half} ${geometry.size} ${geometry.size}"><circle class="backdrop" r="${half}"/>${sectors}${hub}</svg>${list}`,
    hint: `<span>${kbd(['←', '→', '↑', '↓'])} ${escapeHtml(t('menu.hint.navigate'))}</span><span>${escapeHtml(t('menu.hint.release'))}</span><span>${kbd(['Esc'])} ${escapeHtml(t('menu.hint.cancel'))}</span>`,
  }
}
