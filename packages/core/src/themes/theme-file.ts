import { z } from 'zod'
import type { TextPosition } from '../ports/settings-text.ts'
import { previewValue } from '../settings/preview-value.ts'

export const THEME_TYPES = ['dark', 'light'] as const
export type ThemeType = (typeof THEME_TYPES)[number]

// The tokens a theme may set, as packages/design names them (`themes.<type>.color`, `terminal`, `syntax`);
// a test in the window checks both lists stay the same
export const THEME_COLOR_KEYS = [
  'bg',
  'surface',
  'line',
  'controlLine',
  'fg',
  'muted',
  'tabActive',
  'accent',
  'accentInk',
  'success',
  'warning',
  'critical',
  'diffAdd',
  'diffAddWord',
  'diffAddInk',
  'diffRemove',
  'diffRemoveWord',
  'diffRemoveInk',
  'searchMatch',
  'searchCurrent',
] as const
export const TERMINAL_COLOR_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const
export const SYNTAX_COLOR_KEYS = [
  'storage',
  'control',
  'constant',
  'type',
  'function',
  'string',
  'number',
  'property',
  'variable',
  'operator',
  'punctuation',
  'comment',
  'invalid',
  'bracket1',
  'bracket2',
  'bracket3',
  'indentGuide',
] as const

export const THEME_GROUPS = {
  colors: THEME_COLOR_KEYS,
  terminal: TERMINAL_COLOR_KEYS,
  syntax: SYNTAX_COLOR_KEYS,
} as const
export type ThemeGroup = keyof typeof THEME_GROUPS
type Colors<K extends string> = Readonly<Partial<Record<K, string>>>

// Single colors by group: what a theme file sets, and `colorCustomizations` over the theme in use
export interface ThemeColorLayer {
  readonly colors: Colors<(typeof THEME_COLOR_KEYS)[number]>
  readonly terminal: Colors<(typeof TERMINAL_COLOR_KEYS)[number]>
  readonly syntax: Colors<(typeof SYNTAX_COLOR_KEYS)[number]>
}

export interface ThemeFile extends ThemeColorLayer {
  readonly name: string
  readonly type: ThemeType
}

export const THEME_NAME_MAX = 100

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isThemeName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= THEME_NAME_MAX

// A group keeps its known keys with a hex value; anything else is dropped entry by entry
function colorGroup<const K extends readonly [string, ...string[]]>(keys: K) {
  return z.preprocess(
    (value) =>
      Object.fromEntries(
        Object.entries(isRecord(value) ? value : {}).filter(
          ([key, color]) => (keys as readonly string[]).includes(key) && isHexColor(color),
        ),
      ),
    z.partialRecord(z.enum(keys), z.string()),
  )
}

export const colorLayerSchema = z.preprocess(
  (value) => (isRecord(value) ? value : {}),
  z.object({
    colors: colorGroup(THEME_COLOR_KEYS),
    terminal: colorGroup(TERMINAL_COLOR_KEYS),
    syntax: colorGroup(SYNTAX_COLOR_KEYS),
  }),
)

// What the window asks the host to write: a whole theme, every value checked, nothing corrected
export const themeFileSchema = z.object({
  name: z.string().trim().min(1).max(THEME_NAME_MAX),
  type: z.enum(THEME_TYPES),
  colors: z.partialRecord(z.enum(THEME_COLOR_KEYS), z.string().refine(isHexColor)),
  terminal: z.partialRecord(z.enum(TERMINAL_COLOR_KEYS), z.string().refine(isHexColor)),
  syntax: z.partialRecord(z.enum(SYNTAX_COLOR_KEYS), z.string().refine(isHexColor)),
})

// Why a value of a theme file is not used as written: not valid (dck's own value is used), no such key, or
// a `type` left out (dark is used)
export type ThemeIssueKind = 'ignored' | 'unknown' | 'missing'

export interface ThemeIssue {
  // Dotted, as the user finds it in the file
  readonly key: string
  readonly kind: ThemeIssueKind
  readonly found?: string
}

// A file of the themes folder as the host read it
export interface UserTheme {
  // The file's name in the folder and its absolute path
  readonly file: string
  readonly path: string
  // Undefined while the file never read as JSON with comments
  readonly theme?: ThemeFile
  readonly issues: readonly ThemeIssue[]
  // Where the text stops being valid; the theme is then the last good one read, if any
  readonly invalid?: TextPosition
}

export interface UserThemes {
  // The folder beside settings.json; it may not exist yet
  readonly folder: string
  readonly themes: readonly UserTheme[]
}

export const noUserThemes = (folder: string): UserThemes => ({ folder, themes: [] })

// Reads a theme file's object (old, hand-edited or half-written) into a theme and what it did not use;
// `fallbackName` is the file's name, for a theme without one
export function parseThemeFile(
  raw: Readonly<Record<string, unknown>>,
  fallbackName: string,
): { readonly theme: ThemeFile; readonly issues: readonly ThemeIssue[] } {
  const issues: ThemeIssue[] = []
  const ignored = (key: string, found: unknown) =>
    issues.push({ key, kind: 'ignored', found: previewValue(found) })
  for (const [key, value] of Object.entries(raw)) {
    if (!['name', 'type', ...Object.keys(THEME_GROUPS)].includes(key))
      issues.push({ key, kind: 'unknown', found: previewValue(value) })
  }
  if (raw.name !== undefined && !isThemeName(raw.name)) ignored('name', raw.name)
  const type = THEME_TYPES.find((candidate) => candidate === raw.type)
  if (raw.type === undefined) issues.push({ key: 'type', kind: 'missing' })
  else if (type === undefined) ignored('type', raw.type)
  for (const [group, keys] of Object.entries(THEME_GROUPS)) {
    const values = raw[group]
    if (values === undefined) continue
    if (!isRecord(values)) {
      ignored(group, values)
      continue
    }
    for (const [key, color] of Object.entries(values)) {
      if (!(keys as readonly string[]).includes(key))
        issues.push({ key: `${group}.${key}`, kind: 'unknown', found: previewValue(color) })
      else if (!isHexColor(color)) ignored(`${group}.${key}`, color)
    }
  }
  const layer = colorLayerSchema.parse(raw)
  return {
    theme: {
      name: isThemeName(raw.name) ? raw.name.trim() : fallbackName,
      type: type ?? 'dark',
      ...layer,
    },
    issues,
  }
}

// A theme as the window and the host know it: two themes of one type never share a name
export const themeKey = (theme: { readonly name: string; readonly type: ThemeType }) =>
  `${theme.type}:${theme.name}`
