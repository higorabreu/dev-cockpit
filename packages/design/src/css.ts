import { parseHex } from './color.ts'
import type { ThemeName, Tokens } from './tokens.ts'

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

function themeDeclarations(tokens: Tokens, theme: ThemeName): string[] {
  const { color, overlay } = tokens.themes[theme]
  const { mix } = tokens
  const mixed = (share: number, base: string) =>
    `color-mix(in srgb, var(--fg) ${share}%, var(${base}))`
  return [
    ...Object.entries(color).map(([name, value]) => `--${kebab(name)}: ${value};`),
    `--bg-rgb: ${parseHex(color.bg).join(', ')};`,
    ...Object.entries(overlay).map(([name, value]) => `--${kebab(name)}: ${value};`),
    `--sector-idle: ${mixed(mix.sectorIdle, '--surface')};`,
    `--sector-selected: ${mixed(mix.sectorSelected, '--surface')};`,
    `--list-selected: ${mixed(mix.listSelected, '--surface')};`,
    `--icon-idle: ${mixed(mix.iconIdle, '--surface')};`,
    `color-scheme: ${theme};`,
  ]
}

function sharedDeclarations(tokens: Tokens): string[] {
  const entries = (prefix: string, values: Readonly<Record<string, string | number>>) =>
    Object.entries(values).map(([name, value]) => `--${prefix}-${kebab(name)}: ${value};`)
  return [
    ...entries('font', tokens.font),
    `--font-size-terminal: ${tokens.size.terminal}px;`,
    ...entries('radius', tokens.radius),
    ...entries('motion', tokens.motion),
  ]
}

const block = (selector: string, declarations: readonly string[], indent = '') =>
  `${indent}${selector} {\n${declarations.map((line) => `${indent}  ${line}`).join('\n')}\n${indent}}`

// Escuro primeiro: é o padrão, e o claro entra pelo sistema ou pela escolha explícita
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
