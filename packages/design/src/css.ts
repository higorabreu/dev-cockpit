import { parseHex } from './color.ts'
import type { ThemeName, Tokens } from './tokens.ts'

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

// Every variable a theme sets on the root, so the window can apply any resolved theme at run time
export function themeVariables(
  tokens: Tokens,
  theme: ThemeName,
): readonly (readonly [string, string])[] {
  const { color, overlay, syntax } = tokens.themes[theme]
  const { mix } = tokens
  const mixed = (share: number, base: string) =>
    `color-mix(in srgb, var(--fg) ${share}%, var(${base}))`
  return [
    ...Object.entries(color).map(([name, value]) => [`--${kebab(name)}`, value] as const),
    ['--bg-rgb', parseHex(color.bg).join(', ')],
    ...Object.entries(overlay).map(([name, value]) => [`--${kebab(name)}`, value] as const),
    ...Object.entries(syntax).map(([name, value]) => [`--syntax-${kebab(name)}`, value] as const),
    ['--sector-idle', mixed(mix.sectorIdle, '--surface')],
    ['--sector-selected', mixed(mix.sectorSelected, '--surface')],
    ['--list-selected', mixed(mix.listSelected, '--surface')],
    ['--line-selected', mixed(mix.lineSelected, '--bg')],
    ['--line-selected-add', mixed(mix.lineSelected, '--diff-add')],
    ['--line-selected-remove', mixed(mix.lineSelected, '--diff-remove')],
    ['--icon-idle', mixed(mix.iconIdle, '--surface')],
    ['color-scheme', theme],
  ]
}

const themeDeclarations = (tokens: Tokens, theme: ThemeName): string[] =>
  themeVariables(tokens, theme).map(([name, value]) => `${name}: ${value};`)

function sharedDeclarations(tokens: Tokens): string[] {
  const entries = (prefix: string, values: Readonly<Record<string, string | number>>) =>
    Object.entries(values).map(([name, value]) => `--${prefix}-${kebab(name)}: ${value};`)
  return [
    ...entries('font', tokens.font),
    `--font-size-terminal: ${tokens.size.terminal}px;`,
    `--size-scrollbar: ${tokens.size.scrollbar}px;`,
    `--size-scrollbar-thumb: ${tokens.size.scrollbarThumb}px;`,
    `--size-hairline: ${tokens.size.hairline}px;`,
    `--size-bar: ${tokens.size.bar}px;`,
    `--size-header: ${tokens.size.header}px;`,
    ...entries('radius', tokens.radius),
    ...entries('motion', tokens.motion),
  ]
}

const block = (selector: string, declarations: readonly string[], indent = '') =>
  `${indent}${selector} {\n${declarations.map((line) => `${indent}  ${line}`).join('\n')}\n${indent}}`

// Dark first: it is the default, and light comes in through the system or an explicit choice
export function buildCss(tokens: Tokens): string {
  const dark = themeDeclarations(tokens, 'dark')
  const light = themeDeclarations(tokens, 'light')
  return [
    block(':root', [...sharedDeclarations(tokens), ...dark]),
    `@media (prefers-color-scheme: light) {\n${block(':root:not([data-theme="dark"])', light, '  ')}\n}`,
    block(':root[data-theme="light"]', light),
    block(':root[data-theme="dark"]', dark),
  ].join('\n\n')
}
