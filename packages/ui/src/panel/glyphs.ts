import type { ContainerState, SessionActivity } from '@dck/core'

const SVG = 'http://www.w3.org/2000/svg'

// State is always shown as both shape and text: filled circle, hollow or arc
export type GlyphKind = SessionActivity | 'done' | ContainerState

const SHAPES: Record<GlyphKind, string> = {
  agent: '<circle cx="8" cy="8" r="5.2" fill="currentColor" stroke="none"/>',
  idle: '<circle cx="8" cy="8" r="5"/>',
  busy: '<path d="M8 3a5 5 0 1 1-5 5"/>',
  done: '<circle cx="8" cy="8" r="6"/><path d="M5.2 8.2l2 2 3.6-4"/>',
  running: '<circle cx="8" cy="8" r="5.2" fill="currentColor" stroke="none"/>',
  starting: '<path d="M8 3a5 5 0 1 1-5 5"/>',
  stopped: '<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/>',
  paused: '<path d="M6 4v8M10 4v8"/>',
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
