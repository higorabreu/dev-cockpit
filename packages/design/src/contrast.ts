import { contrastRatio, mix, parseHex, type Rgb } from './color.ts'
import type { ThemeName, Tokens } from './tokens.ts'

export interface ContrastCheck {
  readonly name: string
  readonly ratio: number
  readonly minimum: number
  readonly passes: boolean
}

const TEXT = 4.5
const GRAPHIC = 3

// Derived fills follow the same mix CSS does with color-mix
export function contrastChecks(tokens: Tokens, theme: ThemeName): readonly ContrastCheck[] {
  const { color, terminal } = tokens.themes[theme]
  const rgb = (hex: string): Rgb => parseHex(hex)
  const surface = rgb(color.surface)
  const fg = rgb(color.fg)
  const share = (percent: number) => percent / 100
  const sectorIdle = mix(fg, surface, share(tokens.mix.sectorIdle))
  const sectorSelected = mix(fg, surface, share(tokens.mix.sectorSelected))
  const listSelected = mix(fg, surface, share(tokens.mix.listSelected))
  const iconIdle = mix(fg, surface, share(tokens.mix.iconIdle))

  const pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]> = [
    ['primary text on the window', fg, rgb(color.bg), TEXT],
    ['primary text on the surface', fg, surface, TEXT],
    ['secondary text on the window', rgb(color.muted), rgb(color.bg), TEXT],
    ['secondary text on the surface', rgb(color.muted), surface, TEXT],
    ['active tab', fg, rgb(color.tabActive), TEXT],
    ['idle sector label', fg, sectorIdle, TEXT],
    ['selected sector label', fg, sectorSelected, TEXT],
    ['idle sector icon', iconIdle, sectorIdle, GRAPHIC],
    ['selected sector icon', fg, sectorSelected, GRAPHIC],
    ['selected sector outline', rgb(color.muted), surface, GRAPHIC],
    ['selected list item', fg, listSelected, TEXT],
    // Inputs fill with the window color inside the surface, so their edge meets both
    ['control border on the surface', rgb(color.controlLine), surface, GRAPHIC],
    ['control border on the window', rgb(color.controlLine), rgb(color.bg), GRAPHIC],
    ['primary button text', rgb(color.accentInk), rgb(color.accent), TEXT],
    ['checked box on the surface', rgb(color.accent), surface, GRAPHIC],
    ['success on the surface', rgb(color.success), surface, TEXT],
    ['warning on the surface', rgb(color.warning), surface, TEXT],
    ['warning on the window', rgb(color.warning), rgb(color.bg), TEXT],
    ['critical on the surface', rgb(color.critical), surface, TEXT],
  ]

  // The dark theme's black serves as background for colored text and is not read as text
  const exempt = new Set(theme === 'dark' ? ['black'] : [])
  const ansi = Object.entries(terminal)
    .filter(([name]) => !exempt.has(name))
    .map(
      ([name, hex]) => [`terminal ${name} on the window`, rgb(hex), rgb(color.bg), TEXT] as const,
    )

  return [...pairs, ...ansi].map(([name, foreground, background, minimum]) => {
    const ratio = contrastRatio(foreground, background)
    return { name, ratio, minimum, passes: ratio >= minimum }
  })
}
