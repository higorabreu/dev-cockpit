import { type MessageKey, SYNTAX_COLOR_KEYS, TERMINAL_COLOR_KEYS, type Translator } from '@dck/core'
import { type ContrastCheck, tokens } from '@dck/design'

// The tooltip stays small: the weakest pairs, the rest counted
const SHOWN = 5

type Syntax = (typeof SYNTAX_COLOR_KEYS)[number]
type Terminal = (typeof TERMINAL_COLOR_KEYS)[number]

const TEXT_COLORS = [
  'fg',
  'muted',
  'controlLine',
  'accentInk',
  'accent',
  'success',
  'warning',
  'critical',
  'diffAddInk',
  'diffRemoveInk',
  'bg',
] as const
const GROUND_COLORS = [
  'bg',
  'surface',
  'tabActive',
  'accent',
  'searchMatch',
  'searchCurrent',
  'diffAdd',
  'diffAddWord',
  'diffRemove',
  'diffRemoveWord',
  'fg',
] as const

// A derived fill is named the way contrast.ts writes it, from the same mix tokens
const mixRef = (percent: number, base: string) => `color-mix(colors.fg ${percent}%, ${base})`
const { mix } = tokens

const TEXTS: ReadonlyMap<string, MessageKey> = new Map<string, MessageKey>([
  ...TEXT_COLORS.map(
    (name) =>
      [`colors.${name}`, `contrast.text.colors.${name}` satisfies MessageKey] as [
        string,
        MessageKey,
      ],
  ),
  ...SYNTAX_COLOR_KEYS.map(
    (name: Syntax) =>
      [`syntax.${name}`, `contrast.text.syntax.${name}` satisfies MessageKey] as [
        string,
        MessageKey,
      ],
  ),
  ...TERMINAL_COLOR_KEYS.map(
    (name: Terminal) =>
      [`terminal.${name}`, `contrast.text.terminal.${name}` satisfies MessageKey] as [
        string,
        MessageKey,
      ],
  ),
  [mixRef(mix.iconIdle, 'colors.surface'), 'contrast.text.iconIdle'],
])

const GROUNDS: ReadonlyMap<string, MessageKey> = new Map<string, MessageKey>([
  ...GROUND_COLORS.map(
    (name) =>
      [`colors.${name}`, `contrast.ground.colors.${name}` satisfies MessageKey] as [
        string,
        MessageKey,
      ],
  ),
  [mixRef(mix.lineSelected, 'colors.bg'), 'contrast.ground.selection'],
  [mixRef(mix.lineSelected, 'colors.diffAdd'), 'contrast.ground.selectedAdded'],
  [mixRef(mix.lineSelected, 'colors.diffRemove'), 'contrast.ground.selectedRemoved'],
  // The terminal's selection without focus is the same mix as an editor selection, so it reads as one
  [mixRef(mix.terminalSelection, 'colors.bg'), 'contrast.ground.terminalSelection'],
  [mixRef(mix.sectorIdle, 'colors.surface'), 'contrast.ground.holdMenu'],
  [mixRef(mix.sectorSelected, 'colors.surface'), 'contrast.ground.holdMenu'],
  [mixRef(mix.listSelected, 'colors.surface'), 'contrast.ground.listSelected'],
])

// A color as people name it; a reference with no label shows as written
export function contrastLabel(i18n: Translator, ref: string, as: 'text' | 'ground'): string {
  const key = (as === 'text' ? TEXTS : GROUNDS).get(ref)
  return key ? i18n.t(key) : ref
}

// The low contrast line's tooltip: one pair a line, the weakest first, in plain words
export function contrastTip(i18n: Translator, failures: readonly ContrastCheck[]): string {
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 })
  const lines = failures.slice(0, SHOWN).map((check) =>
    i18n.t('settings.colorTheme.lowContrast.pair', {
      text: contrastLabel(i18n, check.foreground, 'text'),
      ground: contrastLabel(i18n, check.background, 'ground'),
      // Rounded down, so a pair just under its minimum never reads as reaching it
      ratio: number.format(Math.floor(check.ratio * 10) / 10),
      minimum: number.format(check.minimum),
    }),
  )
  if (failures.length > SHOWN)
    lines.push(i18n.t('settings.colorTheme.lowContrast.more', { count: failures.length - SHOWN }))
  return lines.join('\n')
}
