// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { installTooltips } from './tooltip.ts'

describe('installTooltips', () => {
  it('should give the control its own description back when the tooltip hides', () => {
    document.body.replaceChildren()
    installTooltips()
    const button = document.createElement('button')
    button.setAttribute('data-tip', 'Outside the rules: No capitals')
    button.setAttribute('aria-describedby', 'branch-hint')
    document.body.append(button)

    button.focus()
    const shown = button.getAttribute('aria-describedby')
    button.blur()

    expect(shown).toBe('branch-hint tooltip')
    expect(button.getAttribute('aria-describedby')).toBe('branch-hint')
  })

  it('should show the tooltip of a control when it gets the keyboard focus', () => {
    document.body.replaceChildren()
    installTooltips()
    const button = document.createElement('button')
    button.setAttribute('data-tip', 'Outside the rules: No capitals')
    document.body.append(button)

    button.focus()

    const tip = document.getElementById('tooltip')
    expect(tip?.hidden).toBe(false)
    expect(tip?.textContent).toBe('Outside the rules: No capitals')
  })
})
