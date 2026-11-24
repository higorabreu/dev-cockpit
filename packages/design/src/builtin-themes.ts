import dckVivoDark from '../themes/dck-vivo-dark.json' with { type: 'json' }
import dckVivoLight from '../themes/dck-vivo-light.json' with { type: 'json' }
import dracula from '../themes/dracula.json' with { type: 'json' }
import estruturaDark from '../themes/estrutura-dark.json' with { type: 'json' }
import estruturaLight from '../themes/estrutura-light.json' with { type: 'json' }
import githubDark from '../themes/github-dark.json' with { type: 'json' }
import githubLight from '../themes/github-light.json' with { type: 'json' }
import grafiteDark from '../themes/grafite-dark.json' with { type: 'json' }
import grafiteLight from '../themes/grafite-light.json' with { type: 'json' }
import oneDarkPro from '../themes/one-dark-pro.json' with { type: 'json' }
import salviaDark from '../themes/salvia-dark.json' with { type: 'json' }
import salviaLight from '../themes/salvia-light.json' with { type: 'json' }
import sinalDark from '../themes/sinal-dark.json' with { type: 'json' }
import sinalLight from '../themes/sinal-light.json' with { type: 'json' }
import terraDark from '../themes/terra-dark.json' with { type: 'json' }
import terraLight from '../themes/terra-light.json' with { type: 'json' }
import type { ThemeDefinition } from './theme.ts'

interface ThemeJson extends Omit<ThemeDefinition, 'type'> {
  readonly type: string
}

const definition = (file: ThemeJson): ThemeDefinition => {
  if (file.type !== 'dark' && file.type !== 'light')
    throw new Error(`bad built-in theme: ${file.name}`)
  return { ...file, type: file.type }
}

// dck first, as the default of both modes; the palettes explored on 2026-11-19 over dck's interface; then
// three of the most installed VS Code themes, credited in themes/NOTICE.md
export const builtinThemes: readonly ThemeDefinition[] = [
  { name: 'dck', type: 'dark' },
  { name: 'dck', type: 'light' },
  ...[
    dckVivoDark,
    dckVivoLight,
    grafiteDark,
    grafiteLight,
    salviaDark,
    salviaLight,
    terraDark,
    terraLight,
    estruturaDark,
    estruturaLight,
    sinalDark,
    sinalLight,
    githubDark,
    githubLight,
    oneDarkPro,
    dracula,
  ].map(definition),
]

export const DEFAULT_THEME_NAME = 'dck'
