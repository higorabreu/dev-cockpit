import { describe, expect, it } from 'vitest'
import { buildCss } from './css.ts'
import { tokens } from './tokens.ts'

describe('buildCss', () => {
  const css = buildCss(tokens)

  it('should define the dark theme on the root when building the css', () => {
    expect(css).toMatch(/:root \{[^}]*--fg: #e6e6e6;/)
    expect(css).toMatch(/:root \{[^}]*color-scheme: dark;/)
  })

  it('should switch to the light theme with the system preference when the user did not choose', () => {
    expect(css).toContain('@media (prefers-color-scheme: light)')
    expect(css).toContain(':root:not([data-theme="dark"])')
  })

  it('should let an explicit choice win over the system preference when a theme is set', () => {
    expect(css).toContain(':root[data-theme="light"]')
    expect(css).toContain(':root[data-theme="dark"]')
  })

  it('should expose the window color as channels when building the css', () => {
    expect(css).toContain('--bg-rgb: 14, 14, 14;')
    expect(css).toContain('--bg-rgb: 248, 248, 248;')
  })

  it('should derive the wheel fills from the mix tokens when building the css', () => {
    expect(css).toContain('--sector-idle: color-mix(in srgb, var(--fg) 6%, var(--surface));')
    expect(css).toContain('--icon-idle: color-mix(in srgb, var(--fg) 80%, var(--surface));')
  })

  it('should use kebab case names when a token is camel case', () => {
    expect(css).toContain('--tab-active:')
    expect(css).toContain('--accent-ink:')
    expect(css).not.toMatch(/--tabActive/)
  })

  it('should include the shared font, size, radius and motion tokens when building the css', () => {
    expect(css).toContain('--font-mono:')
    expect(css).toContain('--font-size-terminal: 16px;')
    expect(css).toContain('--radius-medium: 8px;')
    expect(css).toContain('--motion-normal: 170ms;')
  })
})
