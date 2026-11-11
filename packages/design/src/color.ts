export type Rgb = readonly [number, number, number]

export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match?.[1]) throw new Error(`invalid hex color: ${hex}`)
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function mix(foreground: Rgb, background: Rgb, foregroundShare: number): Rgb {
  const blend = (index: 0 | 1 | 2) =>
    Math.round(foreground[index] * foregroundShare + background[index] * (1 - foregroundShare))
  return [blend(0), blend(1), blend(2)]
}

export function relativeLuminance(color: Rgb): number {
  const [red, green, blue] = color.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b))
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b))
  return (lighter + 0.05) / (darker + 0.05)
}
