import {
  CENTER,
  currentCategory,
  type HoldMenuState,
  sectorAngle,
  selectedIndex,
  type Translate,
} from '@dck/core'

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

export const WHEEL_SIZE = 196
const INNER = 38
const OUTER = 96
const GAP = 4

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ENTITIES[char] ?? char)
const fixed = (value: number) => value.toFixed(1)
const point = (radius: number, angle: number) =>
  [Math.cos(angle) * radius, Math.sin(angle) * radius] as const

// Each radial edge is shifted inward from the sector, leaving a constant-width gap
function sectorPath(index: number, count: number) {
  const step = (2 * Math.PI) / count
  const start = sectorAngle(index, count) - step / 2
  const end = start + step
  const half = GAP / 2
  const edge = (angle: number, radius: number, side: number) => {
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    return `${fixed(ux * radius - uy * half * side)} ${fixed(uy * radius + ux * half * side)}`
  }
  const outer = fixed(Math.hypot(OUTER, half))
  const inner = fixed(Math.hypot(INNER, half))
  return `M${edge(start, OUTER, 1)} A${outer} ${outer} 0 0 1 ${edge(end, OUTER, -1)} L${edge(end, INNER, -1)} A${inner} ${inner} 0 0 0 ${edge(start, INNER, 1)}Z`
}

// The list opens outside the wheel, in the direction of the selected sector
function fanStyle(index: number, count: number) {
  const angle = sectorAngle(index, count)
  const cx = Math.cos(angle)
  const cy = Math.sin(angle)
  const reach = WHEEL_SIZE / 2 + 12
  const x = WHEEL_SIZE / 2 + cx * reach
  const y = WHEEL_SIZE / 2 + cy * reach
  let shift = 'translate(-50%, 0)'
  if (cx > 0.35) shift = 'translate(0, -50%)'
  else if (cx < -0.35) shift = 'translate(-100%, -50%)'
  else if (cy < 0) shift = 'translate(-50%, -100%)'
  return `left:${fixed(x)}px;top:${fixed(y)}px;transform:${shift}`
}

const SIDE_ROWS = 9
const VERTICAL_ROWS = 5

// Top and bottom sectors have less room, so the list opens vertically
const maxRows = (index: number, count: number) =>
  index >= 0 && Math.abs(Math.cos(sectorAngle(index, count))) > 0.35 ? SIDE_ROWS : VERTICAL_ROWS

// Window of rows around the selected one, for lists taller than the screen
function visibleWindow(total: number, selected: number, rows: number): readonly number[] {
  const size = Math.min(total, rows)
  const start = Math.min(Math.max(selected - Math.floor(size / 2), 0), total - size)
  return Array.from({ length: size }, (_, offset) => start + offset)
}

const kbd = (keys: readonly string[]) => keys.map((key) => `<kbd>${key}</kbd>`).join('')

export interface MenuMarkup {
  readonly mode: 'wheel-mode' | 'switch-mode'
  readonly card: string
  readonly hint: string
}

export function wheelMarkup(state: HoldMenuState, t: Translate): MenuMarkup {
  const count = state.categories.length
  const category = currentCategory(state)
  const sectors = state.categories
    .map((entry, index) => {
      const [x, y] = point(68, sectorAngle(index, count))
      const on = index === state.category ? ' on' : ''
      return `<g class="sec${on}" data-category="${index}"><path d="${sectorPath(index, count)}"/><svg class="glyph" x="${fixed(x - 10)}" y="${fixed(y - 19)}" width="20" height="20" ${ICON_ATTRS}><path d="${PATHS[entry.icon] ?? ''}"/></svg><text x="${fixed(x)}" y="${fixed(y + 17)}">${escapeHtml(entry.label)}</text></g>`
    })
    .join('')
  const hub = category
    ? `<svg x="-9" y="-16" width="18" height="18" ${ICON_ATTRS} style="color:var(--fg)"><path d="${PATHS[category.icon] ?? ''}"/></svg><text class="hubt" y="14">${escapeHtml(t('menu.hub.count', { index: selectedIndex(state) + 1, total: category.items.length }))}</text>`
    : `<svg x="-20" y="-20" width="40" height="40" viewBox="0 0 100 100" aria-hidden="true" style="color:var(--muted)"><path fill="currentColor" fill-rule="evenodd" d="${IDENTITY_PATH}"/><path d="M54 50 59 55.5 54 61M63 61H72" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  const rows = category?.items.length
    ? visibleWindow(category.items.length, selectedIndex(state), maxRows(state.category, count))
        .map((index) => {
          const item = category.items[index]
          if (!item) return ''
          return `<button type="button" class="it${index === selectedIndex(state) ? ' on' : ''}" data-item="${index}"><span class="l">${escapeHtml(item.label)}</span><span class="k">${escapeHtml(item.shortcut ?? '')}</span></button>`
        })
        .join('')
    : `<div class="empty">${escapeHtml(t('menu.empty'))}</div>`
  const list =
    state.category === CENTER
      ? ''
      : `<div class="list fan" style="${fanStyle(state.category, count)}">${rows}</div>`
  return {
    mode: 'wheel-mode',
    card: `<svg class="wheel" width="${WHEEL_SIZE}" height="${WHEEL_SIZE}" viewBox="-98 -98 196 196"><circle class="backdrop" r="98"/>${sectors}${hub}</svg>${list}`,
    hint: `<span>${kbd(['←', '→', '↑', '↓'])} ${escapeHtml(t('menu.hint.navigate'))}</span><span>${escapeHtml(t('menu.hint.release'))}</span><span>${kbd(['Esc'])} ${escapeHtml(t('menu.hint.cancel'))}</span>`,
  }
}

export interface SwitcherChip {
  readonly label: string
  readonly note: string
}

export function switcherMarkup(
  chips: readonly SwitcherChip[],
  index: number,
  t: Translate,
): MenuMarkup {
  const strip = chips
    .map(
      (chip, at) =>
        `<div class="chip${at === index ? ' on' : ''}"><b>${escapeHtml(chip.label)}</b><small>${escapeHtml(chip.note)}</small></div>`,
    )
    .join('')
  return {
    mode: 'switch-mode',
    card: `<div class="ttl">${escapeHtml(t('menu.switcher.title'))}</div><div class="strip">${strip}</div>`,
    hint: `<span>${kbd([t('menu.key.space')])} ${escapeHtml(t('menu.switcher.next'))}</span><span>${kbd(['Shift', t('menu.key.space')])} ${escapeHtml(t('menu.switcher.previous'))}</span><span>${escapeHtml(t('menu.switcher.release'))}</span>`,
  }
}
