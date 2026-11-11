export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export interface TooltipPlacement {
  readonly x: number
  readonly y: number
  readonly side: 'below' | 'above'
}

const GAP = 6
const MARGIN = 8

// Abaixo do elemento por padrão; acima quando embaixo não cabe e em cima há mais espaço.
// Na horizontal alinha à esquerda do elemento e nunca sai da janela
export function placeTooltip(anchor: Box, tip: Size, viewport: Size): TooltipPlacement {
  const below = anchor.y + anchor.height + GAP
  const above = anchor.y - GAP - tip.height
  const fitsBelow = below + tip.height <= viewport.height - MARGIN
  const side = fitsBelow || above < MARGIN ? 'below' : 'above'
  const x = Math.min(
    Math.max(anchor.x, MARGIN),
    Math.max(MARGIN, viewport.width - tip.width - MARGIN),
  )
  const y = side === 'below' ? Math.min(below, viewport.height - tip.height - MARGIN) : above
  return { x, y: Math.max(MARGIN, y), side }
}
