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

  it('should check the hold menu overflow cue as a graphic when checking each theme', () => {
    for (const theme of themeNames) {
      const cue = contrastChecks(tokens, theme).find(
        (check) => check.name === 'hold menu overflow cue',
      )

      expect(cue?.minimum).toBe(3)
      expect(cue?.passes).toBe(true)
    }
  })

  it('should check the code on every tint of a line selected for a comment when checking each theme', () => {
    for (const theme of themeNames) {
      const names = contrastChecks(tokens, theme).map((check) => check.name)

      expect(names).toEqual(
        expect.arrayContaining([
          'code on a selected line',
          'code on a selected added line',
          'code on a selected removed line',
        ]),
      )
    }
  })

  it('should check the selected terminal text with and without focus when checking each theme', () => {
    for (const theme of themeNames) {
      const checks = contrastChecks(tokens, theme).filter((check) =>
        check.name.startsWith('selected terminal text'),
      )

      expect(checks.map((check) => check.name)).toEqual([
        'selected terminal text',
        'selected terminal text without focus',
      ])
      expect(checks.every((check) => check.minimum === 4.5 && check.passes)).toBe(true)
    }
  })

  it('should report the selected terminal text when the selection is too dark for it', () => {
    const heavy = { ...tokens, mix: { ...tokens.mix, terminalSelection: 80 } }

    const failures = contrastChecks(heavy, 'light').filter((check) => !check.passes)

    expect(failures.map((check) => check.name)).toContain('selected terminal text')
  })
})
