import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTheme, themeNames, tokens } from '@dck/design'
import { describe, expect, it } from 'vitest'
import { terminalTheme } from './theme.ts'

const terminalCss = readFileSync(
  join(import.meta.dirname, '../styles/terminal.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

describe('terminalTheme', () => {
  it('should give xterm the opaque window color as its background when building each theme', () => {
    for (const name of themeNames) {
      // Act
      const theme = terminalTheme(name)

      // Assert
      expect(theme.background).toBe(tokens.themes[name].color.bg)
      expect(theme.background).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('should keep the text color as the fill of reverse video when building each theme', () => {
    for (const name of themeNames) {
      // Act
      const theme = terminalTheme(name)

      // Assert
      expect(theme.foreground).toBe(tokens.themes[name].color.fg)
      expect(theme.foreground).not.toBe(theme.background)
    }
  })

  it('should draw the letter under the block cursor in the window color when building each theme', () => {
    for (const name of themeNames) {
      // Act
      const theme = terminalTheme(name)

      // Assert
      expect(theme.cursor).toBe(tokens.themes[name].color.fg)
      expect(theme.cursorAccent).toBe(tokens.themes[name].color.bg)
    }
  })

  it('should leave every layer xterm paints its background on transparent when reading the terminal styles', () => {
    // Arrange
    const rule = [...terminalCss.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((match) =>
      /background-color:\s*transparent\s*!important/.test(match[2] ?? ''),
    )

    // Act
    const selectors = (rule?.[1] ?? '').split(',').map((selector) => selector.trim())

    // Assert
    expect(selectors).toEqual(
      expect.arrayContaining([
        '.xterm',
        '.xterm .xterm-viewport',
        '.xterm .xterm-scrollable-element',
      ]),
    )
  })
})

describe('terminalTheme of a resolved theme', () => {
  it("should take the theme's colors when building the terminal's from a user theme", () => {
    // Arrange
    const theme = resolveTheme(tokens, 'dark', [
      { colors: { bg: '#101418', fg: '#dddddd' }, terminal: { red: '#ff8080' } },
    ])

    // Act
    const colors = terminalTheme('dark', theme)

    // Assert
    expect([colors.background, colors.foreground, colors.red]).toEqual([
      '#101418',
      '#dddddd',
      '#ff8080',
    ])
  })
})
