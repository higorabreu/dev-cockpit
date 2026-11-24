import {
  colorCustomizationsPatch,
  type MessageKey,
  type SettingsFileLocation,
  type SettingsPatch,
  type SettingsUpdate,
  type ThemeIssue,
  type Translator,
} from '@dck/core'
import type { ThemeName } from '@dck/design'
import { createSelect } from '../kit/select.ts'
import { h } from '../panel/dom.ts'
import { activeTheme, contrastFailures, themeCopy } from '../themes/theme-catalog.ts'
import type { ThemesClient } from '../themes/themes-client.ts'
import { contrastTip } from './contrast-labels.ts'
import type { SettingsClient } from './settings-client.ts'

type Child = Node | string | false | undefined

export interface ThemeSectionContext {
  readonly settings: SettingsClient
  readonly themes: ThemesClient
  readonly i18n: Translator
  // `more` sits under the row's name
  row(key: string, label: string, control: Child, hint?: string, more?: Child): HTMLElement
  labelId(key: string): string
  disabled(key: string): boolean
  commit(patch: SettingsPatch): Promise<SettingsUpdate>
  render(): void
  // A theme file in a tab of its own, saved only on Ctrl+S; false when there was nothing to open
  openThemeFile(location: SettingsFileLocation | undefined, name: string): Promise<boolean>
  // settings.json in a tab of its own, where the color overrides are written
  openSettingsFile(): void
  // Whether settings.json holds this setting wrongly
  hasIssue(key: string): boolean
}

// A long list would push the page down: the weakest pairs are named, the rest counted
const SHOWN = 4
const OVERRIDES = 'colorCustomizations'

const GROUPS = ['colors', 'terminal', 'syntax'] as const
const TYPES: readonly ThemeName[] = ['dark', 'light']

// How many single colors settings.json sets over the theme
export function overrideCount(layer: Readonly<Record<(typeof GROUPS)[number], object>>): number {
  return GROUPS.reduce((count, group) => count + Object.keys(layer[group]).length, 0)
}

// Every override removed: a patch merges a map, so each entry goes as null
export function clearOverridesPatch(
  layer: Readonly<Record<(typeof GROUPS)[number], object>>,
): SettingsPatch {
  return colorCustomizationsPatch(
    Object.fromEntries(
      GROUPS.map((group) => [
        group,
        Object.fromEntries(Object.keys(layer[group]).map((key) => [key, null])),
      ]),
    ),
  )
}

export function createThemeSection(context: ThemeSectionContext) {
  const { settings, themes, i18n } = context
  const t = i18n.t
  // The mode whose last "New theme" could not be written, said under its picker until the next try
  let failed: ThemeName | undefined

  const listed = (items: readonly string[]) =>
    items.length > SHOWN
      ? [
          ...items.slice(0, SHOWN),
          t('settings.colorTheme.more', { count: items.length - SHOWN }),
        ].join(' · ')
      : items.join(' · ')

  const issueText = (issue: ThemeIssue) =>
    t('settings.colorTheme.issue', {
      key: issue.key,
      reason: t(`settings.colorTheme.issue.${issue.kind}` as MessageKey),
    })

  function picker(type: ThemeName): HTMLElement {
    const key = `colorTheme.${type}`
    const current = settings.current().colorTheme[type]
    const entries = themes.catalog().of(type)
    const options = entries.map((entry) => ({
      value: entry.definition.name,
      label: entry.definition.name,
      ...(entry.user ? { detail: entry.user.file } : {}),
    }))
    // A name set by hand stays listed, so the control never shows another theme than the file's
    if (!options.some((option) => option.value === current))
      options.push({ value: current, label: current })
    const control = createSelect({
      id: `set-colorTheme-${type}`,
      options,
      value: current,
      labelledBy: context.labelId(key),
      disabled: context.disabled(key),
      onChange: (value) => void context.commit({ colorTheme: { [type]: value } }),
    })
    control.button.dataset.focus = `set-${key}`
    return control.element
  }

  async function newTheme(type: ThemeName) {
    const catalog = themes.catalog()
    const { entry } = activeTheme(catalog, settings.current(), type)
    const copy = themeCopy(catalog, entry)
    const location = await themes.create(copy)
    failed = location === undefined ? type : undefined
    // The copy becomes the mode's theme, so each save shows in the cockpit at once
    if (location) await context.commit({ colorTheme: { [type]: copy.name } })
    const opened = await context.openThemeFile(location, t('settings.colorTheme.tab'))
    if (!opened) context.render()
  }

  // A short word on the button, its full meaning in the tooltip
  function smallButton(focus: string, label: MessageKey, tip: MessageKey, run: () => void) {
    const button = h(
      'button',
      { type: 'button', class: 'srecord', 'data-focus': focus, 'data-tip': t(tip) },
      t(label),
    )
    button.addEventListener('click', run)
    return button
  }

  // Beside the picker: copy the theme into a new user theme, and open the file of a user theme
  function control(type: ThemeName): HTMLElement {
    const { entry } = activeTheme(themes.catalog(), settings.current(), type)
    const file = entry.user
    return h(
      'span',
      { class: 'stheme-control' },
      picker(type),
      smallButton(
        `set-theme-new-${type}`,
        'settings.colorTheme.copy',
        'settings.colorTheme.new',
        () => void newTheme(type),
      ),
      file &&
        smallButton(
          `set-theme-open-${type}`,
          'settings.edit',
          'settings.colorTheme.openFile',
          () =>
            void context.openThemeFile(
              { path: file.path, folder: themes.catalog().folder },
              t('settings.colorTheme.tab'),
            ),
        ),
    )
  }

  // Under a mode's picker: what keeps its theme from being used as written, then the low contrast line
  function notes(type: ThemeName): Child[] {
    const catalog = themes.catalog()
    const active = activeTheme(catalog, settings.current(), type)
    const file = active.entry.user
    const lines: string[] = []
    if (active.missing)
      lines.push(t('settings.colorTheme.missing', { name: settings.current().colorTheme[type] }))
    if (file?.invalid)
      lines.push(t('settings.colorTheme.invalid', { file: file.file, ...file.invalid }))
    if (file && file.issues.length > 0)
      lines.push(
        t('settings.colorTheme.fileIssues', {
          file: file.file,
          issues: listed(file.issues.map(issueText)),
        }),
      )
    for (const taken of catalog.taken)
      if (taken.theme?.type === type)
        lines.push(t('settings.colorTheme.taken', { file: taken.file, name: taken.theme.name }))
    if (failed === type) lines.push(t('settings.colorTheme.newFailed'))
    return [
      ...lines.map((line) => h('span', { class: 'snote', role: 'status' }, line)),
      lowContrast(type),
    ]
  }

  // One quiet line with the count; the weakest pairs, in plain words, in its tooltip, which the keyboard
  // reaches too
  function lowContrast(type: ThemeName): Child {
    const active = activeTheme(themes.catalog(), settings.current(), type)
    const failures = contrastFailures(active.type, active.tokens)
    if (failures.length === 0) return undefined
    return h(
      'span',
      {
        class: 'stheme-contrast',
        role: 'status',
        tabindex: '0',
        'data-focus': `set-theme-contrast-${type}`,
        'data-tip': contrastTip(i18n, failures),
      },
      h('span', { class: 'stheme-contrast-dot', 'aria-hidden': 'true' }),
      i18n.plural('settings.colorTheme.lowContrast', failures.length),
    )
  }

  function themeRow(type: ThemeName, label: MessageKey): HTMLElement {
    const lines = notes(type).filter(Boolean)
    return context.row(
      `colorTheme.${type}`,
      t(label),
      control(type),
      undefined,
      lines.length > 0 && h('span', { class: 'stheme-more' }, ...lines),
    )
  }

  // The themes that can apply: the mode's, or both for System. One the file holds wrongly shows too, so
  // its warning and reset have a place
  function shownTypes(): readonly ThemeName[] {
    const mode = settings.current().theme
    return TYPES.filter(
      (type) => mode === 'system' || mode === type || context.hasIssue(`colorTheme.${type}`),
    )
  }

  function overridesRow(): HTMLElement {
    const count = overrideCount(settings.current().colorCustomizations)
    return context.row(
      OVERRIDES,
      t('settings.colorCustomizations'),
      h(
        'span',
        { class: 'stheme-control' },
        h(
          'span',
          { class: 'shint' },
          count === 0
            ? t('settings.colorCustomizations.none')
            : i18n.plural('settings.colorCustomizations.count', count),
        ),
        smallButton('set-overrides-edit', 'settings.edit', 'settings.file.open', () =>
          context.openSettingsFile(),
        ),
      ),
      t('settings.colorCustomizations.hint'),
    )
  }

  return {
    // One picker named Theme, or one per mode when both can apply
    pickers: (): HTMLElement[] => {
      const types = shownTypes()
      return types.map((type) =>
        themeRow(type, types.length > 1 ? `settings.colorTheme.${type}` : 'settings.colorTheme'),
      )
    },
    overrides: overridesRow,
    reset() {
      failed = undefined
    },
  }
}
