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

export type TooltipSide = 'below' | 'above' | 'left'

export interface TooltipPlacement {
  readonly x: number
  readonly y: number
  readonly side: TooltipSide
}

const GAP = 6
const MARGIN = 8

// Abaixo do elemento por padrão; acima quando embaixo não cabe e em cima há mais espaço.
// Na horizontal alinha à esquerda do elemento e nunca sai da janela
export function placeTooltip(
  anchor: Box,
  tip: Size,
  viewport: Size,
  prefer: 'below' | 'left' = 'below',
): TooltipPlacement {
  if (prefer === 'left') {
    const x = anchor.x - GAP - tip.width
    // Ao lado, centralizado no elemento; sem espaço à esquerda, cai para o posicionamento normal
    if (x >= MARGIN) {
      const centered = anchor.y + (anchor.height - tip.height) / 2
      const y = Math.min(
        Math.max(centered, MARGIN),
        Math.max(MARGIN, viewport.height - tip.height - MARGIN),
      )
      return { x, y, side: 'left' }
    }
  }
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
