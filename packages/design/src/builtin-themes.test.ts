import { describe, expect, it } from 'vitest'
import { builtinThemes } from './builtin-themes.ts'
import { contrastChecks } from './contrast.ts'
import { resolveTheme, withTheme } from './theme.ts'
import { tokens } from './tokens.ts'

describe('builtinThemes', () => {
  for (const theme of builtinThemes) {
    it(`should pass every WCAG AA pair when checking ${theme.name} (${theme.type})`, () => {
      const resolved = resolveTheme(tokens, theme.type, [theme])

      const failures = contrastChecks(withTheme(tokens, theme.type, resolved), theme.type)
        .filter((check) => !check.passes)
        .map((check) => `${check.name}: ${check.ratio.toFixed(2)}:1`)

      expect(failures).toEqual([])
    })
  }

  it('should name each theme once per type when listing the built-in themes', () => {
    const keys = builtinThemes.map((theme) => `${theme.type}:${theme.name}`)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('should start with dck for both types when listing the built-in themes', () => {
    const [first, second] = builtinThemes

    expect([first?.name, second?.name]).toEqual(['dck', 'dck'])
    expect([first?.type, second?.type]).toEqual(['dark', 'light'])
  })

  it("should set only the tokens dck's own theme has when reading every built-in theme", () => {
    const unknown = builtinThemes.flatMap((theme) => {
      const base = tokens.themes[theme.type]
      const extra = (group: string, values: object | undefined, known: object) =>
        Object.keys(values ?? {})
          .filter((key) => !(key in known))
          .map((key) => `${theme.name}: ${group}.${key}`)
      return [
        ...extra('colors', theme.colors, base.color),
        ...extra('terminal', theme.terminal, base.terminal),
        ...extra('syntax', theme.syntax, base.syntax),
      ]
    })

    expect(unknown).toEqual([])
  })

  it('should write every color as six hex digits when reading every built-in theme', () => {
    const values = builtinThemes.flatMap((theme) => [
      ...Object.values(theme.colors ?? {}),
      ...Object.values(theme.terminal ?? {}),
      ...Object.values(theme.syntax ?? {}),
    ])

    expect(values.filter((value) => !/^#[0-9a-f]{6}$/.test(value))).toEqual([])
  })
})
