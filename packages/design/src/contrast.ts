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
  const { color, terminal, syntax } = tokens.themes[theme]
  const rgb = (hex: string): Rgb => parseHex(hex)
  const surface = rgb(color.surface)
  const fg = rgb(color.fg)
  const share = (percent: number) => percent / 100
  const sectorIdle = mix(fg, surface, share(tokens.mix.sectorIdle))
  const sectorSelected = mix(fg, surface, share(tokens.mix.sectorSelected))
  const listSelected = mix(fg, surface, share(tokens.mix.listSelected))
  const iconIdle = mix(fg, surface, share(tokens.mix.iconIdle))
  const selectedLine = (base: string) => mix(fg, rgb(base), share(tokens.mix.lineSelected))
  const terminalSelected = (percent: number) => mix(fg, rgb(color.bg), share(percent))

  const pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]> = [
    ['primary text on the window', fg, rgb(color.bg), TEXT],
    // Reverse video (pager and editor status lines) swaps them: the window color on a cell of text color
    ['reverse video in the terminal', rgb(color.bg), fg, TEXT],
    // The block cursor is the text color and the letter under it takes the window color
    ['letter under the block cursor', rgb(color.bg), fg, TEXT],
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
    ['hold menu overflow cue', rgb(color.muted), surface, GRAPHIC],
    // Inputs fill with the window color inside the surface, so their edge meets both
    ['control border on the surface', rgb(color.controlLine), surface, GRAPHIC],
    ['control border on the window', rgb(color.controlLine), rgb(color.bg), GRAPHIC],
    ['primary button text', rgb(color.accentInk), rgb(color.accent), TEXT],
    ['checked box on the surface', rgb(color.accent), surface, GRAPHIC],
    ['success on the surface', rgb(color.success), surface, TEXT],
    ['warning on the surface', rgb(color.warning), surface, TEXT],
    // The needs you mark sits on the tab bar and on the active tab or the selected row of the tab list
    ['warning mark on the window', rgb(color.warning), rgb(color.bg), GRAPHIC],
    ['warning mark on the active tab', rgb(color.warning), rgb(color.tabActive), GRAPHIC],
    // The current search match is told by its warning underline as well as its tint, and the matches out of
    // view by their marks beside the scrollbar
    ['current search match underline', rgb(color.warning), rgb(color.bg), GRAPHIC],
    [
      'current search match underline on its tint',
      rgb(color.warning),
      rgb(color.searchCurrent),
      GRAPHIC,
    ],
    ['search match mark in the scrollbar', rgb(color.warning), rgb(color.bg), GRAPHIC],
    ['critical on the surface', rgb(color.critical), surface, TEXT],
    // A field that holds no valid entry (Go to line) draws its edge in the critical color on its fill
    ['invalid field edge on the window', rgb(color.critical), rgb(color.bg), GRAPHIC],
    // A diff's code stays primary text on every tint; numbers and signs take the line's own ink
    ['code on an added line', fg, rgb(color.diffAdd), TEXT],
    ['code on an added word', fg, rgb(color.diffAddWord), TEXT],
    ['number on an added line', rgb(color.diffAddInk), rgb(color.diffAdd), TEXT],
    ['added count on the window', rgb(color.diffAddInk), rgb(color.bg), TEXT],
    ['code on a removed line', fg, rgb(color.diffRemove), TEXT],
    ['code on a removed word', fg, rgb(color.diffRemoveWord), TEXT],
    ['number on a removed line', rgb(color.diffRemoveInk), rgb(color.diffRemove), TEXT],
    ['removed count on the window', rgb(color.diffRemoveInk), rgb(color.bg), TEXT],
    // A line selected for a comment draws its code, numbers and sign in the primary text
    ['code on a selected line', fg, selectedLine(color.bg), TEXT],
    ['code on a selected added line', fg, selectedLine(color.diffAdd), TEXT],
    ['code on a selected removed line', fg, selectedLine(color.diffRemove), TEXT],
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
    ['modified file letter on the window', rgb(color.warning), rgb(color.bg), TEXT],
    ['modified file letter on the surface', rgb(color.warning), surface, TEXT],
    ['added file letter on the window', rgb(color.diffAddInk), rgb(color.bg), TEXT],
    ['added file letter on the surface', rgb(color.diffAddInk), surface, TEXT],
    ['deleted file letter on the window', rgb(color.diffRemoveInk), rgb(color.bg), TEXT],
    ['deleted file letter on the surface', rgb(color.diffRemoveInk), surface, TEXT],
  ]

  // The dark theme's black serves as background for colored text and is not read as text
  const exempt = new Set(theme === 'dark' ? ['black'] : [])
  const ansi = Object.entries(terminal)
    .filter(([name]) => !exempt.has(name))
    .map(
      ([name, hex]) => [`terminal ${name} on the window`, rgb(hex), rgb(color.bg), TEXT] as const,
    )

  // Every text the editor draws, the plain text and each syntax role, comments included, on every ground it
  // can sit on: the window, a selection (focused or not, and a matching bracket: one tint), a search match
  // and the current one, the lines a merge took from the disk and the sides of Compare. The indent guides
  // are decorative
  const { indentGuide: _decorative, ...roles } = syntax
  const grounds: ReadonlyArray<readonly [string, Rgb]> = [
    ['the editor', rgb(color.bg)],
    ['a selection', selectedLine(color.bg)],
    ['a search match', rgb(color.searchMatch)],
    ['the current search match', rgb(color.searchCurrent)],
    ['a line from the disk', rgb(color.diffAdd)],
    ['a removed line', rgb(color.diffRemove)],
  ]
  const code = [['plain text', color.fg] as const, ...Object.entries(roles)].flatMap(
    ([name, hex]) =>
      grounds.map(
        ([ground, background]) =>
          [`syntax ${name} on ${ground}`, rgb(hex), background, TEXT] as const,
      ),
  )

  return [...pairs, ...ansi, ...code].map(([name, foreground, background, minimum]) => {
    const ratio = contrastRatio(foreground, background)
    return { name, ratio, minimum, passes: ratio >= minimum }
  })
}
