export const OPACITY = { min: 0.3, max: 1, step: 0.05, initial: 0.92 } as const
export const PANEL_WIDTH = { min: 220, max: 420, initial: 300 } as const
export const FONT_SIZE = { min: 10, max: 32, initial: 16 } as const

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function stepOpacity(current: number, direction: 1 | -1): number {
  const next = current + direction * OPACITY.step
  return Math.round(clamp(next, OPACITY.min, OPACITY.max) * 100) / 100
}

export function stepFontSize(current: number, delta: number): number {
  return clamp(Math.round(current + delta), FONT_SIZE.min, FONT_SIZE.max)
}

// Valor guardado fora do intervalo ou ilegível volta ao padrão, nunca quebra a janela
export function readPreference(
  raw: string | null,
  range: { readonly min: number; readonly max: number; readonly initial: number },
): number {
  const value = Number(raw)
  if (raw === null || raw.trim() === '' || !Number.isFinite(value)) return range.initial
  return value >= range.min && value <= range.max ? value : range.initial
}

export function clampPanelWidth(value: number): number {
  return clamp(Math.round(value), PANEL_WIDTH.min, PANEL_WIDTH.max)
}
