import { describe, expect, it } from 'vitest'
import { contrastChecks } from './contrast.ts'
import { themeNames, tokens } from './tokens.ts'

describe('contrastChecks', () => {
  for (const theme of themeNames) {
    it(`should pass every WCAG AA pair when checking the ${theme} theme`, () => {
      const checks = contrastChecks(tokens, theme)

      const failures = checks
        .filter((check) => !check.passes)
        .map((check) => `${check.name}: ${check.ratio.toFixed(2)}:1, mínimo ${check.minimum}:1`)

      expect(failures).toEqual([])
    })
  }

  it('should check the sixteen terminal colors except the dark black when checking the dark theme', () => {
    const names = contrastChecks(tokens, 'dark').map((check) => check.name)

    expect(names.filter((name) => name.startsWith('terminal '))).toHaveLength(15)
    expect(names).not.toContain('terminal black sobre a janela')
  })

  it('should report a failure when a color does not reach the minimum', () => {
    const weak = {
      ...tokens,
      themes: {
        ...tokens.themes,
        dark: { ...tokens.themes.dark, color: { ...tokens.themes.dark.color, muted: '#2c2c2c' } },
      },
    }

    const failures = contrastChecks(weak, 'dark').filter((check) => !check.passes)

    expect(failures.map((check) => check.name)).toContain('texto secundário sobre a janela')
  })
})
