// What the system tells of its fonts: the one the user's own terminal draws with, the system's monospace
// font, the families installed (monospace ones apart) and those that draw a prompt's Powerline and Nerd
// Font symbols. Undefined or empty when it cannot tell
export interface SystemFontsInfo {
  readonly terminal?: string
  readonly monospace?: string
  readonly families: readonly string[]
  readonly monospaceFamilies: readonly string[]
  readonly symbols: readonly string[]
}

export const noSystemFonts: SystemFontsInfo = { families: [], monospaceFamilies: [], symbols: [] }

// A family name as a setting may hold it: letters, digits, spaces and . _ -, so it can never break out of
// a CSS font-family list
export const FONT_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,127}$/u

export const isFontName = (name: string) => FONT_NAME.test(name)

const STYLE_WORDS = new Set([
  'thin',
  'extralight',
  'ultralight',
  'light',
  'semilight',
  'book',
  'regular',
  'normal',
  'medium',
  'semibold',
  'demibold',
  'bold',
  'extrabold',
  'ultrabold',
  'black',
  'heavy',
  'italic',
  'oblique',
  'condensed',
  'expanded',
])

// The family of a Pango font description such as GNOME keeps ("MesloLGS NF Bold 12"): its size and
// style words go, whatever is left is the family
export function familyFromDescription(description: string): string | undefined {
  const words = description.trim().replace(/,$/, '').split(/\s+/)
  if (words.length > 0 && /^\d+(\.\d+)?(px)?$/.test(words.at(-1) ?? '')) words.pop()
  while (words.length > 1 && STYLE_WORDS.has((words.at(-1) ?? '').toLowerCase().replace(/-/g, '')))
    words.pop()
  const family = words.join(' ')
  return isFontName(family) ? family : undefined
}

const GENERIC = new Set([
  'monospace',
  'ui-monospace',
  'sans-serif',
  'serif',
  'system-ui',
  'ui-sans-serif',
])

// A CSS font-family list: names quoted, generic families bare, each once, unsafe names left out
export function fontList(families: readonly (string | undefined)[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const family of families) {
    if (!family) continue
    const key = family.toLowerCase()
    if (seen.has(key)) continue
    if (GENERIC.has(key)) out.push(family)
    else if (isFontName(family)) out.push(`'${family}'`)
    else continue
    seen.add(key)
  }
  return out.join(', ')
}

// The cockpit's own monospace font, shipped with it
export const COCKPIT_MONO = 'JetBrains Mono Variable'

// The family the terminal draws with: the user's choice, else their own terminal's, else the system's,
// else the cockpit's own (a system that names none, where the generic monospace may be Courier)
export function terminalFamily(choice: string | null, system: SystemFontsInfo): string {
  return choice ?? system.terminal ?? system.monospace ?? COCKPIT_MONO
}

// The terminal's font list: the chosen family first, then the user's terminal's, the system's, the
// cockpit's and the symbol fonts. Chromium never looks through the system's fonts for a private use
// glyph (a prompt's Powerline arrows), so a font that draws one must be named here
export function terminalFontStack(choice: string | null, system: SystemFontsInfo): string {
  return fontList([
    terminalFamily(choice, system),
    system.terminal,
    system.monospace,
    COCKPIT_MONO,
    ...system.symbols,
    'ui-monospace',
    'monospace',
  ])
}
