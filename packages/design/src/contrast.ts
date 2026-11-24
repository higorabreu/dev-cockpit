import { contrastRatio, mix, parseHex, type Rgb } from './color.ts'
import type { ThemeName, Tokens } from './tokens.ts'

export interface ContrastCheck {
  readonly name: string
  // The two colors as the theme file names them (`syntax.comment`, `colors.bg`), or the mix CSS makes of them
  readonly foreground: string
  readonly background: string
  readonly ratio: number
  readonly minimum: number
  readonly passes: boolean
}

const TEXT = 4.5
const GRAPHIC = 3

interface Shade {
  readonly ref: string
  readonly rgb: Rgb
}

// Derived fills follow the same mix CSS does with color-mix
export function contrastChecks(tokens: Tokens, theme: ThemeName): readonly ContrastCheck[] {
  const { color, terminal, syntax } = tokens.themes[theme]
  const of = <K extends string>(
    group: string,
    values: Readonly<Record<K, string>>,
    key: K,
  ): Shade => ({ ref: `${group}.${key}`, rgb: parseHex(values[key]) })
  const keys = <K extends string>(values: Readonly<Record<K, string>>) => Object.keys(values) as K[]
  const c = (key: keyof typeof color) => of('colors', color, key)
  const surface = c('surface')
  const fg = c('fg')
  const bg = c('bg')
  const warning = c('warning')
  const mixed = (percent: number, base: Shade): Shade => ({
    ref: `color-mix(${fg.ref} ${percent}%, ${base.ref})`,
    rgb: mix(fg.rgb, base.rgb, percent / 100),
  })
  const sectorIdle = mixed(tokens.mix.sectorIdle, surface)
  const sectorSelected = mixed(tokens.mix.sectorSelected, surface)
  const listSelected = mixed(tokens.mix.listSelected, surface)
  const iconIdle = mixed(tokens.mix.iconIdle, surface)
  const selectedLine = (base: Shade) => mixed(tokens.mix.lineSelected, base)
  const terminalSelected = (percent: number) => mixed(percent, bg)

  const pairs: ReadonlyArray<readonly [string, Shade, Shade, number]> = [
    ['primary text on the window', fg, bg, TEXT],
    // Reverse video (pager and editor status lines) swaps them: the window color on a cell of text color
    ['reverse video in the terminal', bg, fg, TEXT],
    // The block cursor is the text color and the letter under it takes the window color
    ['letter under the block cursor', bg, fg, TEXT],
    ['primary text on the surface', fg, surface, TEXT],
    ['secondary text on the window', c('muted'), bg, TEXT],
    ['secondary text on the surface', c('muted'), surface, TEXT],
    ['active tab', fg, c('tabActive'), TEXT],
    ['idle sector label', fg, sectorIdle, TEXT],
    ['selected sector label', fg, sectorSelected, TEXT],
    ['idle sector icon', iconIdle, sectorIdle, GRAPHIC],
    ['selected sector icon', fg, sectorSelected, GRAPHIC],
    ['selected sector outline', c('muted'), surface, GRAPHIC],
    ['selected list item', fg, listSelected, TEXT],
    ['hold menu overflow cue', c('muted'), surface, GRAPHIC],
    // Inputs fill with the window color inside the surface, so their edge meets both
    ['control border on the surface', c('controlLine'), surface, GRAPHIC],
    ['control border on the window', c('controlLine'), bg, GRAPHIC],
    ['primary button text', c('accentInk'), c('accent'), TEXT],
    ['checked box on the surface', c('accent'), surface, GRAPHIC],
    ['success on the surface', c('success'), surface, TEXT],
    ['warning on the surface', warning, surface, TEXT],
    // The needs you mark sits on the tab bar and on the active tab or the selected row of the tab list
    ['warning mark on the window', warning, bg, GRAPHIC],
    ['warning mark on the active tab', warning, c('tabActive'), GRAPHIC],
    // The current search match is told by its warning outline as well as its tint, and the matches out of
    // view by their marks beside the scrollbar
    ['current search match outline', warning, bg, GRAPHIC],
    ['current search match outline on its tint', warning, c('searchCurrent'), GRAPHIC],
    ['search match mark in the scrollbar', warning, bg, GRAPHIC],
    ['critical on the surface', c('critical'), surface, TEXT],
    // A field that holds no valid entry (Go to line) draws its edge in the critical color on its fill
    ['invalid field edge on the window', c('critical'), bg, GRAPHIC],
    // A diff's code stays primary text on every tint; numbers and signs take the line's own ink
    ['code on an added line', fg, c('diffAdd'), TEXT],
    ['code on an added word', fg, c('diffAddWord'), TEXT],
    ['number on an added line', c('diffAddInk'), c('diffAdd'), TEXT],
    ['added count on the window', c('diffAddInk'), bg, TEXT],
    ['code on a removed line', fg, c('diffRemove'), TEXT],
    ['code on a removed word', fg, c('diffRemoveWord'), TEXT],
    ['number on a removed line', c('diffRemoveInk'), c('diffRemove'), TEXT],
    ['removed count on the window', c('diffRemoveInk'), bg, TEXT],
    // A line selected for a comment draws its code, numbers and sign in the primary text
    ['code on a selected line', fg, selectedLine(bg), TEXT],
    ['code on a selected added line', fg, selectedLine(c('diffAdd')), TEXT],
    ['code on a selected removed line', fg, selectedLine(c('diffRemove')), TEXT],
    // Selected terminal text is always the primary text, with the terminal focused or not
    ['selected terminal text', fg, terminalSelected(tokens.mix.terminalSelection), TEXT],
    [
      'selected terminal text without focus',
      fg,
      terminalSelected(tokens.mix.terminalSelectionInactive),
      TEXT,
    ],
    // A file's state is a letter (M, A, D...) in the ink of its counts, on the index (the window) and on
    // a file's header (the surface); a selected row turns it to primary text, renamed is secondary text
    ['modified file letter on the window', warning, bg, TEXT],
    ['modified file letter on the surface', warning, surface, TEXT],
    ['added file letter on the window', c('diffAddInk'), bg, TEXT],
    ['added file letter on the surface', c('diffAddInk'), surface, TEXT],
    ['deleted file letter on the window', c('diffRemoveInk'), bg, TEXT],
    ['deleted file letter on the surface', c('diffRemoveInk'), surface, TEXT],
  ]

  // The dark theme's black serves as background for colored text and is not read as text
  const exempt = new Set(theme === 'dark' ? ['black'] : [])
  const ansi = keys(terminal)
    .filter((name) => !exempt.has(name))
    .map(
      (name) =>
        [`terminal ${name} on the window`, of('terminal', terminal, name), bg, TEXT] as const,
    )

  // Every text the editor draws, the plain text and each syntax role, comments included, on every ground it
  // can sit on: the window, a selection (focused or not, and a matching bracket: one tint), a search match
  // and the current one, the lines a merge took from the disk, the sides of Compare and a Markdown preview's
  // code block. The indent guides
  // are decorative
  const { indentGuide: _decorative, ...roles } = syntax
  const grounds: ReadonlyArray<readonly [string, Shade]> = [
    ['the editor', bg],
    ['a selection', selectedLine(bg)],
    ['a search match', c('searchMatch')],
    ['the current search match', c('searchCurrent')],
    ['a line from the disk', c('diffAdd')],
    ['a removed line', c('diffRemove')],
    // A code block of the Markdown preview sits on the surface
    ['a code block of the preview', surface],
  ]
  const texts: ReadonlyArray<readonly [string, Shade]> = [
    ['plain text', fg],
    ...keys(roles).map((name) => [name, of('syntax', roles, name)] as const),
  ]
  const code = texts.flatMap(([name, text]) =>
    grounds.map(
      ([ground, background]) => [`syntax ${name} on ${ground}`, text, background, TEXT] as const,
    ),
  )

  return [...pairs, ...ansi, ...code].map(([name, foreground, background, minimum]) => {
    const ratio = contrastRatio(foreground.rgb, background.rgb)
    return {
      name,
      foreground: foreground.ref,
      background: background.ref,
      ratio,
      minimum,
      passes: ratio >= minimum,
    }
  })
}
