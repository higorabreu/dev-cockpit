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

  it('should check reverse video as text when checking each theme', () => {
    for (const theme of themeNames) {
      const reverse = contrastChecks(tokens, theme).find(
        (check) => check.name === 'reverse video in the terminal',
      )

      expect(reverse?.minimum).toBe(4.5)
      expect(reverse?.passes).toBe(true)
    }
  })

  it('should check the letter under the block cursor as text when checking each theme', () => {
    for (const theme of themeNames) {
      const letter = contrastChecks(tokens, theme).find(
        (check) => check.name === 'letter under the block cursor',
      )

      expect(letter?.minimum).toBe(4.5)
      expect(letter?.passes).toBe(true)
    }
  })

  it('should report reverse video when the window color is too close to the text', () => {
    const light = tokens.themes.light
    const close = {
      ...tokens,
      themes: { ...tokens.themes, light: { ...light, color: { ...light.color, bg: '#2a2a2a' } } },
    }

    const failures = contrastChecks(close, 'light').filter((check) => !check.passes)

    expect(failures.map((check) => check.name)).toContain('reverse video in the terminal')
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

  it('should check every syntax role, comments included, on every ground of the editor when checking each theme', () => {
    for (const theme of themeNames) {
      const names = contrastChecks(tokens, theme).map((check) => check.name)
      const roles = Object.keys(tokens.themes[theme].syntax).filter(
        (name) => name !== 'indentGuide',
      )

      for (const name of [...roles, 'plain text'])
        expect(names).toEqual(
          expect.arrayContaining([
            `syntax ${name} on the editor`,
            `syntax ${name} on a selection`,
            `syntax ${name} on a search match`,
            `syntax ${name} on the current search match`,
            `syntax ${name} on a line from the disk`,
            `syntax ${name} on a removed line`,
          ]),
        )
      expect(names).toContain('syntax comment on a selection')
      expect(names).not.toContain('syntax indentGuide on the editor')
    }
  })

  it('should report the current search match when its tint is too strong for the comments', () => {
    const light = tokens.themes.light
    const strong = {
      ...tokens,
      themes: {
        ...tokens.themes,
        light: { ...light, color: { ...light.color, searchCurrent: '#c9b37a' } },
      },
    }

    const failures = contrastChecks(strong, 'light').filter((check) => !check.passes)

    expect(failures.map((check) => check.name)).toContain(
      'syntax comment on the current search match',
    )
  })

  it('should report a syntax color too close to the editor background when it is', () => {
    const dark = tokens.themes.dark
    const dim = {
      ...tokens,
      themes: {
        ...tokens.themes,
        dark: { ...dark, syntax: { ...dark.syntax, comment: '#2a2a2a' } },
      },
    }

    const failures = contrastChecks(dim, 'dark').filter((check) => !check.passes)

    expect(failures.map((check) => check.name)).toContain('syntax comment on the editor')
  })
})
