import {
  defaultSettings,
  SYNTAX_COLOR_KEYS,
  TERMINAL_COLOR_KEYS,
  THEME_COLOR_KEYS,
  type ThemeFile,
  type UserTheme,
} from '@dck/core'
import { tokens } from '@dck/design'
import { describe, expect, it } from 'vitest'
import {
  activeTheme,
  contrastFailures,
  copyName,
  createThemeCatalog,
  themeCopy,
} from './theme-catalog.ts'

const FOLDER = '/home/ana/.config/dck/themes'

const userTheme = (file: string, theme: ThemeFile): UserTheme => ({
  file,
  path: `${FOLDER}/${file}`,
  theme,
  issues: [],
})

const dusk: ThemeFile = {
  name: 'Dusk',
  type: 'dark',
  colors: { bg: '#101418' },
  terminal: {},
  syntax: { comment: '#8a93b8' },
}

const settingsWith = (dark: string, light = 'dck') => ({
  colorTheme: { dark, light },
  colorCustomizations: defaultSettings.colorCustomizations,
})

describe('theme keys', () => {
  it("should list the tokens of the design system's themes when the core validates a theme file", () => {
    const { dark } = tokens.themes

    expect([...THEME_COLOR_KEYS].sort()).toEqual(Object.keys(dark.color).sort())
    expect([...TERMINAL_COLOR_KEYS].sort()).toEqual(Object.keys(dark.terminal).sort())
    expect([...SYNTAX_COLOR_KEYS].sort()).toEqual(Object.keys(dark.syntax).sort())
  })
})

describe('createThemeCatalog', () => {
  it("should list a type's built-in themes first and the user's after them by name", () => {
    const catalog = createThemeCatalog({
      folder: FOLDER,
      themes: [userTheme('zeta.json', { ...dusk, name: 'Zeta' }), userTheme('dusk.json', dusk)],
    })

    const names = catalog.of('dark').map((entry) => entry.definition.name)

    expect(names[0]).toBe('dck')
    expect(names.slice(-2)).toEqual(['Dusk', 'Zeta'])
    expect(catalog.of('light').some((entry) => entry.definition.name === 'Dusk')).toBe(false)
  })

  it('should leave out a user theme whose name and type a built-in theme has', () => {
    const copy = userTheme('dracula.json', { ...dusk, name: 'Dracula' })

    const catalog = createThemeCatalog({ folder: FOLDER, themes: [copy] })

    expect(catalog.taken).toEqual([copy])
    expect(catalog.find('Dracula', 'dark')?.user).toBeUndefined()
  })
})

describe('activeTheme', () => {
  it("should resolve the mode's theme over dck's own colors when the settings name it", () => {
    const catalog = createThemeCatalog({ folder: FOLDER, themes: [userTheme('dusk.json', dusk)] })

    const active = activeTheme(catalog, settingsWith('Dusk'), 'dark')

    expect(active.missing).toBe(false)
    expect(active.tokens.color.bg).toBe('#101418')
    expect(active.tokens.color.fg).toBe(tokens.themes.dark.color.fg)
  })

  it('should use dck and say so when the settings name no theme', () => {
    const catalog = createThemeCatalog({ folder: FOLDER, themes: [] })

    const active = activeTheme(catalog, settingsWith('Gone'), 'dark')

    expect(active.missing).toBe(true)
    expect(active.entry.definition.name).toBe('dck')
    expect(active.tokens).toEqual(tokens.themes.dark)
  })

  it('should apply the overrides over the theme when settings.json has some', () => {
    const catalog = createThemeCatalog({ folder: FOLDER, themes: [userTheme('dusk.json', dusk)] })

    const active = activeTheme(
      catalog,
      {
        colorTheme: { dark: 'Dusk', light: 'dck' },
        colorCustomizations: { colors: { bg: '#000000' }, terminal: {}, syntax: {} },
      },
      'dark',
    )

    expect(active.tokens.color.bg).toBe('#000000')
    expect(active.tokens.syntax.comment).toBe('#8a93b8')
  })

  it('should use a theme of the other type as it is when a mode names one by hand', () => {
    const catalog = createThemeCatalog({ folder: FOLDER, themes: [] })

    const active = activeTheme(catalog, settingsWith('dck', 'Dracula'), 'light')

    expect(active.type).toBe('dark')
    expect(active.missing).toBe(false)
  })
})

describe('contrastFailures', () => {
  it("should find nothing when the theme is dck's own", () => {
    expect(contrastFailures('dark', tokens.themes.dark)).toEqual([])
  })

  it('should name each failing pair of colors once with its weakest reading when a theme is too dim', () => {
    const dim = {
      ...tokens.themes.dark,
      syntax: { ...tokens.themes.dark.syntax, comment: '#303030' },
    }

    const failures = contrastFailures('dark', dim)

    const comments = failures.filter((check) => check.foreground === 'syntax.comment')
    expect(comments.map((check) => check.background)).toContain('colors.bg')
    expect(new Set(comments.map((check) => check.background)).size).toBe(comments.length)
    expect(failures.every((check) => !check.passes)).toBe(true)
  })
})

describe('themeCopy', () => {
  it('should write every token of the theme under a free name when copying it', () => {
    const catalog = createThemeCatalog({
      folder: FOLDER,
      themes: [
        userTheme('dusk-copy.json', { ...dusk, name: 'Dusk copy' }),
        userTheme('dusk.json', dusk),
      ],
    })
    const entry = catalog.find('Dusk', 'dark')
    if (!entry) throw new Error('invariant: Dusk is listed')

    const copy = themeCopy(catalog, entry)

    expect(copy.name).toBe('Dusk copy 2')
    expect(copy.type).toBe('dark')
    expect(copy.colors.bg).toBe('#101418')
    expect(Object.keys(copy.colors)).toHaveLength(THEME_COLOR_KEYS.length)
    expect(Object.keys(copy.terminal)).toHaveLength(TERMINAL_COLOR_KEYS.length)
    expect(Object.keys(copy.syntax)).toHaveLength(SYNTAX_COLOR_KEYS.length)
  })

  it('should keep a name free in the other type when naming a copy', () => {
    const catalog = createThemeCatalog({
      folder: FOLDER,
      themes: [userTheme('dusk-copy.json', { ...dusk, name: 'Dusk copy', type: 'light' })],
    })

    expect(copyName(catalog, 'Dusk', 'dark')).toBe('Dusk copy')
  })
})
