import { describe, expect, it } from 'vitest'
import { contrastChecks } from './contrast.ts'
import { themeNames, tokens } from './tokens.ts'

describe('contrastChecks', () => {
  for (const theme of themeNames) {
    it(`should pass every WCAG AA pair when checking the ${theme} theme`, () => {
      const checks = contrastChecks(tokens, theme)

      const failures = checks
        .filter((check) => !check.passes)
        .map((check) => `${check.name}: ${check.ratio.toFixed(2)}:1, minimum ${check.minimum}:1`)

      expect(failures).toEqual([])
    })
  }

  it('should check the sixteen terminal colors except the dark black when checking the dark theme', () => {
    const names = contrastChecks(tokens, 'dark').map((check) => check.name)

    expect(names.filter((name) => name.startsWith('terminal '))).toHaveLength(15)
    expect(names).not.toContain('terminal black on the window')
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

    expect(failures.map((check) => check.name)).toContain('secondary text on the window')
  })

  it('should check the text and the numbers on the diff tints when checking each theme', () => {
    for (const theme of themeNames) {
      const names = contrastChecks(tokens, theme).map((check) => check.name)

      expect(names).toEqual(
        expect.arrayContaining([
          'code on an added word',
          'number on an added line',
          'code on a removed word',
          'number on a removed line',
        ]),
      )
    }
  })
})
