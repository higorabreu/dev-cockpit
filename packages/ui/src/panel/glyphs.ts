import type { SessionActivity } from '@dck/core'

const SVG = 'http://www.w3.org/2000/svg'

// O estado vai sempre em forma e em texto: círculo cheio, vazado ou em arco
export type GlyphKind = SessionActivity | 'done'

const SHAPES: Record<GlyphKind, string> = {
  claude: '<circle cx="8" cy="8" r="5.2" fill="currentColor" stroke="none"/>',
  idle: '<circle cx="8" cy="8" r="5"/>',
  busy: '<path d="M8 3a5 5 0 1 1-5 5"/>',
  done: '<circle cx="8" cy="8" r="6"/><path d="M5.2 8.2l2 2 3.6-4"/>',
}

export function activityGlyph(activity: GlyphKind): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('class', `glyph glyph-${activity}`)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.innerHTML = SHAPES[activity]
  return svg
}
