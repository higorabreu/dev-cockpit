// @vitest-environment happy-dom
import { defaultSettings, noSystemFonts } from '@dck/core'
import { tokens } from '@dck/design'
import { describe, expect, it } from 'vitest'
import { applyAppearance, terminalLook } from './appearance.ts'

describe('applyAppearance', () => {
  it('should put the chosen fonts before the cockpit fonts when the user picked them', () => {
    // Arrange
    const root = document.createElement('div')

    // Act
    applyAppearance(root, { fontFamily: 'Ubuntu', codeFontFamily: 'Fira Code' })

    // Assert
    expect(root.style.getPropertyValue('--font-sans')).toBe(`'Ubuntu', ${tokens.font.sans}`)
    expect(root.style.getPropertyValue('--font-mono')).toBe(`'Fira Code', ${tokens.font.mono}`)
  })

  it('should go back to the cockpit fonts when the choice is cleared', () => {
    // Arrange
    const root = document.createElement('div')
    applyAppearance(root, { fontFamily: 'Ubuntu', codeFontFamily: 'Fira Code' })

    // Act
    applyAppearance(root, { fontFamily: null, codeFontFamily: null })

    // Assert
    expect(root.style.getPropertyValue('--font-sans')).toBe('')
    expect(root.style.getPropertyValue('--font-mono')).toBe('')
  })
})

describe('terminalLook', () => {
  it('should take the system terminal font and the default cursor when nothing is chosen', () => {
    // Arrange
    const system = { ...noSystemFonts, terminal: 'MesloLGS NF' }

    // Act
    const look = terminalLook(defaultSettings, system)

    // Assert
    expect(look.fontFamily.startsWith("'MesloLGS NF', ")).toBe(true)
    expect(look.cursorStyle).toBe('block')
    expect(look.cursorBlink).toBe(true)
  })

  it('should follow the chosen font and cursor when the user set them', () => {
    // Arrange
    const settings = {
      ...defaultSettings,
      terminal: { fontFamily: 'Hack', cursorStyle: 'bar' as const, cursorBlink: false },
    }

    // Act
    const look = terminalLook(settings, noSystemFonts)

    // Assert
    expect(look.fontFamily.startsWith("'Hack', ")).toBe(true)
    expect(look).toMatchObject({ cursorStyle: 'bar', cursorBlink: false })
  })
})
