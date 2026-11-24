import { describe, expect, it } from 'vitest'
import { buildCss, themeVariables } from './css.ts'
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

  it('should expose the scrollbar sizes when building the css', () => {
    expect(css).toContain('--size-scrollbar: 8px;')
    expect(css).toContain('--size-scrollbar-thumb: 4px;')
  })

  it('should expose the hairline, the tab bar and the header sizes when building the css', () => {
    expect(css).toContain('--size-hairline: 1px;')
    expect(css).toContain('--size-bar: 44px;')
    expect(css).toContain('--size-header: 36px;')
  })

  it('should keep the bar and the header on whole device pixels at the usual scales when reading the tokens', () => {
    const scales = [1, 1.25, 1.5, 1.75, 2]
    const whole = (size: number) => scales.every((scale) => Number.isInteger(size * scale))

    expect([tokens.size.bar, tokens.size.header].filter((size) => !whole(size))).toEqual([])
  })

  it('should define each syntax role for both themes when building the css', () => {
    expect(css).toContain('--syntax-storage: #79a6cf;')
    expect(css).toContain('--syntax-storage: #2b5f8f;')
    expect(css).toContain('--syntax-indent-guide: #232323;')
  })
})

describe('themeVariables', () => {
  it('should list the same declarations the css carries when building them for a theme', () => {
    const css = buildCss(tokens)

    const missing = themeVariables(tokens, 'light')
      .map(([name, value]) => `${name}: ${value};`)
      .filter((declaration) => !css.includes(declaration))

    expect(missing).toEqual([])
  })

  it('should end with the color scheme of the type when building the variables', () => {
    expect(themeVariables(tokens, 'dark').at(-1)).toEqual(['color-scheme', 'dark'])
  })
})
