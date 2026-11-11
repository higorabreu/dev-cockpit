import type { SessionActivity } from '@dck/core'

const SVG = 'http://www.w3.org/2000/svg'

// O estado vai sempre em forma e em texto: círculo cheio, vazado ou em arco
const SHAPES: Record<SessionActivity, string> = {
  claude: '<circle cx="8" cy="8" r="5.2" fill="currentColor" stroke="none"/>',
  idle: '<circle cx="8" cy="8" r="5"/>',
  busy: '<path d="M8 3a5 5 0 1 1-5 5"/>',
}

export function activityGlyph(activity: SessionActivity): SVGSVGElement {
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

export const ACTIVITY_LABEL: Record<SessionActivity, string> = {
  claude: 'Claude em execução',
  idle: 'Aguardando comando',
  busy: 'Executando',
}
