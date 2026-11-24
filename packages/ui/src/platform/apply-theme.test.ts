// @vitest-environment happy-dom
import { resolveTheme, tokens } from '@dck/design'
import { describe, expect, it } from 'vitest'
import { applyTheme } from './theme.ts'

describe('applyTheme', () => {
  it("should set the theme's colors and type on the root when applying a resolved theme", () => {
    // Arrange
    const theme = resolveTheme(tokens, 'light', [{ syntax: { comment: '#4a4a4a' } }])

    // Act
    applyTheme('light', theme)

    // Assert
    const root = document.documentElement
    expect(root.dataset.theme).toBe('light')
    expect(root.style.getPropertyValue('--syntax-comment')).toBe('#4a4a4a')
    expect(root.style.getPropertyValue('--bg')).toBe(tokens.themes.light.color.bg)
  })
})
