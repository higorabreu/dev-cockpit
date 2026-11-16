import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'panes.css'), 'utf8')

// Every rule of the stylesheet that draws the divider's line, with its declarations
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map((match) => ({
    selector: (match[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    body: match[2] ?? '',
  }))
  .filter((rule) => rule.selector.includes('.pane-divider') && rule.selector.includes('::after'))

const bodyOf = (selector: string) => rules.find((rule) => rule.selector === selector)?.body ?? ''

describe('pane divider focus line', () => {
  it('should draw the line 2px wide when it shows under the mouse or with the focus', () => {
    expect(bodyOf('.pane-divider::after')).toMatch(/width:\s*2px/)
  })

  it('should draw a 2px horizontal line when the divider splits stacked panes', () => {
    const body = bodyOf('.pane-divider[aria-orientation="horizontal"]::after')

    expect(body).toMatch(/height:\s*2px/)
    expect(body).toMatch(/width:\s*auto/)
  })

  it('should draw the foreground only on keyboard focus when listing the rules', () => {
    const foreground = rules.filter((rule) => rule.body.includes('var(--fg)'))

    expect(foreground.map((rule) => rule.selector)).toEqual(['.pane-divider:focus-visible::after'])
  })

  it('should keep a mouse drag muted even when the divider has the keyboard focus', () => {
    expect(bodyOf('.pane-divider[data-drag]:focus-visible::after')).toContain('var(--muted)')
    expect(rules.some((rule) => /:focus(?!-visible)/.test(rule.selector))).toBe(false)
  })
})
