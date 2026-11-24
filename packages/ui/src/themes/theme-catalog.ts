import { type Settings, type ThemeFile, themeKey, type UserTheme, type UserThemes } from '@dck/core'
import {
  builtinThemes,
  type ContrastCheck,
  contrastChecks,
  DEFAULT_THEME_NAME,
  resolveTheme,
  type ThemeDefinition,
  type ThemeName,
  type ThemeTokens,
  tokens,
  withTheme,
} from '@dck/design'

export interface ThemeEntry {
  readonly definition: ThemeDefinition
  // The file a user theme comes from; undefined for a built-in one
  readonly user?: UserTheme
}

export interface ThemeCatalog {
  // Where user themes live, beside settings.json
  readonly folder: string
  // The themes of a type: the built-in ones first, then the user's by name
  of(type: ThemeName): readonly ThemeEntry[]
  find(name: string, type: ThemeName): ThemeEntry | undefined
  // User themes left out because a theme of their type already has their name
  readonly taken: readonly UserTheme[]
}

const byName = (a: ThemeEntry, b: ThemeEntry) => a.definition.name.localeCompare(b.definition.name)

export function createThemeCatalog(user: UserThemes): ThemeCatalog {
  const entries = new Map<string, ThemeEntry>()
  for (const definition of builtinThemes) entries.set(themeKey(definition), { definition })
  const taken: UserTheme[] = []
  for (const file of user.themes) {
    if (!file.theme) continue
    const key = themeKey(file.theme)
    if (entries.has(key)) taken.push(file)
    else entries.set(key, { definition: file.theme, user: file })
  }
  const all = [...entries.values()]
  return {
    folder: user.folder,
    of: (type) => [
      ...all.filter((entry) => !entry.user && entry.definition.type === type),
      ...all.filter((entry) => entry.user && entry.definition.type === type).sort(byName),
    ],
    find: (name, type) => entries.get(themeKey({ name, type })),
    taken,
  }
}

export interface ActiveTheme {
  readonly entry: ThemeEntry
  // The theme's own type, which a mode normally matches
  readonly type: ThemeName
  // The name the settings give this mode matches no theme: dck is in its place
  readonly missing: boolean
  // dck's own colors for the type, then the theme, then the user's overrides
  readonly tokens: ThemeTokens
}

type ThemeSettings = Pick<Settings, 'colorTheme' | 'colorCustomizations'>

// A mode's theme; one of the other type named by hand is used as it is
export function activeTheme(
  catalog: ThemeCatalog,
  settings: ThemeSettings,
  mode: ThemeName,
): ActiveTheme {
  const name = settings.colorTheme[mode]
  const found = catalog.find(name, mode) ?? catalog.find(name, mode === 'dark' ? 'light' : 'dark')
  const entry = found ??
    catalog.find(DEFAULT_THEME_NAME, mode) ?? {
      definition: { name: DEFAULT_THEME_NAME, type: mode },
    }
  const { type } = entry.definition
  return {
    entry,
    type,
    missing: found === undefined,
    tokens: resolveTheme(tokens, type, [entry.definition, settings.colorCustomizations]),
  }
}

// The pairs below their minimum, each pair of colors once with its weakest reading: the screen names the
// tokens to change, and several checks often read the same two
export function contrastFailures(type: ThemeName, theme: ThemeTokens): readonly ContrastCheck[] {
  const weakest = new Map<string, ContrastCheck>()
  for (const check of contrastChecks(withTheme(tokens, type, theme), type)) {
    if (check.passes) continue
    const key = `${check.foreground}|${check.background}`
    const seen = weakest.get(key)
    if (!seen || check.ratio < seen.ratio) weakest.set(key, check)
  }
  return [...weakest.values()].sort((a, b) => a.ratio - b.ratio)
}

// A free name for a copy of a theme: "<name> copy", then "<name> copy 2" and on
export function copyName(catalog: ThemeCatalog, name: string, type: ThemeName): string {
  for (let index = 1; ; index += 1) {
    const candidate = index === 1 ? `${name} copy` : `${name} copy ${index}`
    if (!catalog.find(candidate, type)) return candidate
  }
}

// The whole theme, without the user's overrides, so the new file shows every color there is to change
export function themeCopy(catalog: ThemeCatalog, entry: ThemeEntry): ThemeFile {
  const { name, type } = entry.definition
  const resolved = resolveTheme(tokens, type, [entry.definition])
  return {
    name: copyName(catalog, name, type),
    type,
    colors: { ...resolved.color },
    terminal: { ...resolved.terminal },
    syntax: { ...resolved.syntax },
  }
}
