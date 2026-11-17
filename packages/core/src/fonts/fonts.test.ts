import { describe, expect, it } from 'vitest'
import {
  familyFromDescription,
  fontList,
  isFontName,
  noSystemFonts,
  terminalFamily,
  terminalFontStack,
} from './fonts.ts'

describe('familyFromDescription', () => {
  it.each([
    ['MesloLGS NF 12', 'MesloLGS NF'],
    ['JetBrains Mono Bold 11', 'JetBrains Mono'],
    ['Ubuntu Mono 13', 'Ubuntu Mono'],
    ['Source Code Pro Semi-Bold Italic 10.5', 'Source Code Pro'],
    ['Monospace 11', 'Monospace'],
  ])('should read the family %s as %s when GNOME describes a font', (description, family) => {
    expect(familyFromDescription(description)).toBe(family)
  })

  it('should read nothing when the description holds an unsafe name', () => {
    expect(familyFromDescription("Evil'; } body { x 12")).toBeUndefined()
  })
})

describe('isFontName', () => {
  it('should accept a family name and refuse one that could break a CSS list', () => {
    expect(isFontName('FiraCode Nerd Font Mono')).toBe(true)
    expect(isFontName("Mono', serif; color")).toBe(false)
    expect(isFontName('')).toBe(false)
  })
})

describe('fontList', () => {
  it('should quote names, keep generic families bare and drop repeats and unsafe names', () => {
    expect(fontList(['MesloLGS NF', undefined, 'meslolgs nf', 'a;b', 'monospace'])).toBe(
      "'MesloLGS NF', monospace",
    )
  })
})

describe('terminal font', () => {
  const system = { ...noSystemFonts, terminal: 'MesloLGS NF', monospace: 'Ubuntu Mono' }

  it("should follow the user's own terminal when no font was chosen", () => {
    expect(terminalFamily(null, system)).toBe('MesloLGS NF')
    expect(terminalFamily(null, { ...noSystemFonts, monospace: 'Ubuntu Mono' })).toBe('Ubuntu Mono')
    expect(terminalFamily(null, noSystemFonts)).toBe('JetBrains Mono Variable')
  })

  it('should put the chosen font first and the others after it for the glyphs it lacks', () => {
    expect(terminalFontStack('Fira Code', system)).toBe(
      "'Fira Code', 'MesloLGS NF', 'Ubuntu Mono', 'JetBrains Mono Variable', ui-monospace, monospace",
    )
  })

  it('should name the symbol fonts after the cockpit font when the system has fonts for the prompt', () => {
    // Arrange
    const system = {
      ...noSystemFonts,
      monospace: 'DejaVu Sans Mono',
      symbols: ['Symbols Nerd Font'],
    }

    // Act
    const stack = terminalFontStack(null, system)

    // Assert
    expect(stack).toBe(
      "'DejaVu Sans Mono', 'JetBrains Mono Variable', 'Symbols Nerd Font', ui-monospace, monospace",
    )
  })

  it("should draw with the cockpit's font when nothing is known of the system", () => {
    expect(terminalFontStack(null, noSystemFonts)).toBe(
      "'JetBrains Mono Variable', ui-monospace, monospace",
    )
  })
})
