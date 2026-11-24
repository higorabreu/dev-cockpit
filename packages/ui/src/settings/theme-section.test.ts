// @vitest-environment happy-dom
import {
  createTranslator,
  defaultSettings,
  mergeSettings,
  type Settings,
  type SettingsFileLocation,
  type SettingsPatch,
  type ThemeFile,
  type UserThemes,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { h } from '../panel/dom.ts'
import { fixedThemes, type ThemesClient } from '../themes/themes-client.ts'
import type { SettingsClient } from './settings-client.ts'
import { clearOverridesPatch, createThemeSection, overrideCount } from './theme-section.ts'

const FOLDER = '/home/ana/.config/dck/themes'

const glare: ThemeFile = {
  name: 'Glare',
  type: 'dark',
  colors: { bg: '#777777' },
  terminal: {},
  syntax: {},
}

function setup(
  initial: Settings = defaultSettings,
  user: UserThemes = { folder: FOLDER, themes: [] },
) {
  let current = initial
  const patches: SettingsPatch[] = []
  const created: ThemeFile[] = []
  const opened: { location: SettingsFileLocation | undefined; name: string }[] = []
  const fixed = fixedThemes(user)
  const themes: ThemesClient = {
    ...fixed,
    async create(theme) {
      created.push(theme)
      return { path: `${FOLDER}/glare-copy.json`, folder: FOLDER }
    },
  }
  const settings = {
    current: () => current,
    locked: () => [],
    async update(patch: SettingsPatch) {
      patches.push(patch)
      current = mergeSettings(current, patch)
      return { settings: current, locked: [], fresh: false, rejected: [] }
    },
  } as unknown as SettingsClient
  const section = createThemeSection({
    settings,
    themes,
    i18n: createTranslator('en'),
    row: (key, label, control, _hint, more) =>
      h('div', { 'data-setting': key }, h('span', {}, label), control, more),
    labelId: (key) => `label-${key}`,
    disabled: () => false,
    commit: (patch) => settings.update(patch),
    render: () => undefined,
    openThemeFile: async (location, name) => {
      opened.push({ location, name })
      return true
    },
  })
  const draw = () => {
    document.body.replaceChildren(...section.rows())
    return document.body
  }
  return { draw, patches, created, opened }
}

describe('createThemeSection', () => {
  it('should list the built-in themes of each type in its picker when the screen is drawn', () => {
    // Arrange
    const { draw } = setup()

    // Act
    const body = draw()
    body.querySelector<HTMLElement>('[data-setting="colorTheme.light"] .select')?.click()

    // Assert
    const options = [...body.querySelectorAll('[data-setting="colorTheme.light"] [role="option"]')]
    expect(options.map((option) => option.textContent)).toContain('GitHub')
    expect(options.map((option) => option.textContent)).not.toContain('Dracula')
  })

  it('should count the pairs below AA in one quiet line with the pairs in its tooltip when a user theme is too dim', () => {
    // Arrange
    const user = {
      folder: FOLDER,
      themes: [{ file: 'glare.json', path: `${FOLDER}/glare.json`, theme: glare, issues: [] }],
    }
    const settings = mergeSettings(defaultSettings, { colorTheme: { dark: 'Glare' } })
    const { draw } = setup(settings, user)

    // Act
    const body = draw()

    // Assert
    const line = body.querySelector<HTMLElement>(
      '[data-setting="colorTheme.dark"] .stheme-contrast',
    )
    expect(line?.textContent).toMatch(/^Low contrast in \d+ color pairs$/)
    expect(line?.getAttribute('tabindex')).toBe('0')
    expect(line?.dataset.tip?.split('\n')[0]).toMatch(/^.+ on .+: \d(\.\d)? of (4\.5|3)$/)
    expect(line?.hasAttribute('title')).toBe(false)
    expect(body.querySelector('[data-setting="colorTheme.dark"] .snote')).toBeNull()
    expect(
      body.querySelector('[data-setting="colorTheme.dark"] [data-current="true"]')?.textContent,
    ).toBe('Glare')
  })

  it('should say a theme file has bad values when the theme in use has some', () => {
    // Arrange
    const user = {
      folder: FOLDER,
      themes: [
        {
          file: 'glare.json',
          path: `${FOLDER}/glare.json`,
          theme: { ...glare, colors: {} },
          issues: [{ key: 'colors.bg', kind: 'ignored' as const, found: '"grey"' }],
        },
      ],
    }
    const { draw } = setup(mergeSettings(defaultSettings, { colorTheme: { dark: 'Glare' } }), user)

    // Act
    const body = draw()

    // Assert
    expect(body.textContent).toContain('In glare.json: colors.bg is not valid')
  })

  it('should say dck is used when a mode names no theme', () => {
    // Arrange
    const { draw } = setup(mergeSettings(defaultSettings, { colorTheme: { light: 'Gone' } }))

    // Act
    const body = draw()

    // Assert
    expect(body.textContent).toContain('No theme is named Gone; dck is used')
  })

  it("should write a copy of the mode's theme, use it and open it in a tab when asked for a new theme", async () => {
    // Arrange
    const { draw, created, patches, opened } = setup(
      mergeSettings(defaultSettings, { colorTheme: { dark: 'Dracula' } }),
    )

    // Act
    draw().querySelector<HTMLElement>('[data-focus="set-theme-new-dark"]')?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Assert
    expect(created.map((theme) => theme.name)).toEqual(['Dracula copy'])
    expect(patches).toEqual([{ colorTheme: { dark: 'Dracula copy' } }])
    expect(opened).toEqual([
      { location: { path: `${FOLDER}/glare-copy.json`, folder: FOLDER }, name: 'Theme' },
    ])
  })

  it('should offer to open the theme file when the theme in use is a user theme', () => {
    // Arrange
    const user = {
      folder: FOLDER,
      themes: [{ file: 'glare.json', path: `${FOLDER}/glare.json`, theme: glare, issues: [] }],
    }
    const { draw, opened } = setup(
      mergeSettings(defaultSettings, { colorTheme: { dark: 'Glare' } }),
      user,
    )

    // Act
    draw().querySelector<HTMLElement>('[data-focus="set-theme-open-dark"]')?.click()

    // Assert
    expect(opened).toEqual([
      { location: { path: `${FOLDER}/glare.json`, folder: FOLDER }, name: 'Theme' },
    ])
  })
})

describe('color overrides', () => {
  it('should count every override and clear each one when reset', () => {
    // Arrange
    const layer = { colors: { bg: '#000000' }, terminal: { red: '#ff0000' }, syntax: {} }

    // Act
    const count = overrideCount(layer)
    const cleared = mergeSettings(
      mergeSettings(defaultSettings, { colorCustomizations: layer }),
      clearOverridesPatch(layer),
    )

    // Assert
    expect(count).toBe(2)
    expect(cleared.colorCustomizations).toEqual({ colors: {}, terminal: {}, syntax: {} })
  })
})
