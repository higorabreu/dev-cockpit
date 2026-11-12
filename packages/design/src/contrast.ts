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
    ['texto principal sobre a janela', fg, rgb(color.bg), TEXT],
    ['texto principal sobre a superfície', fg, surface, TEXT],
    ['texto secundário sobre a janela', rgb(color.muted), rgb(color.bg), TEXT],
    ['texto secundário sobre a superfície', rgb(color.muted), surface, TEXT],
    ['aba ativa', fg, rgb(color.tabActive), TEXT],
    ['rótulo do setor inativo', fg, sectorIdle, TEXT],
    ['rótulo do setor selecionado', fg, sectorSelected, TEXT],
    ['ícone do setor inativo', iconIdle, sectorIdle, GRAPHIC],
    ['ícone do setor selecionado', fg, sectorSelected, GRAPHIC],
    ['contorno do setor selecionado', rgb(color.muted), surface, GRAPHIC],
    ['item da lista selecionado', fg, listSelected, TEXT],
    ['texto do botão principal', rgb(color.accentInk), rgb(color.accent), TEXT],
    ['sucesso sobre a superfície', rgb(color.success), surface, TEXT],
    ['aviso sobre a superfície', rgb(color.warning), surface, TEXT],
    ['crítico sobre a superfície', rgb(color.critical), surface, TEXT],
  ]

  // The dark theme's black serves as background for colored text and is not read as text
  const exempt = new Set(theme === 'dark' ? ['black'] : [])
  const ansi = Object.entries(terminal)
    .filter(([name]) => !exempt.has(name))
    .map(
      ([name, hex]) => [`terminal ${name} sobre a janela`, rgb(hex), rgb(color.bg), TEXT] as const,
    )

  return [...pairs, ...ansi].map(([name, foreground, background, minimum]) => {
    const ratio = contrastRatio(foreground, background)
    return { name, ratio, minimum, passes: ratio >= minimum }
  })
}
