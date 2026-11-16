// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTooltips } from './tooltip.ts'

installTooltips()

afterEach(() => {
  vi.useRealTimers()
  for (const element of [...document.body.children]) if (element.id !== 'tooltip') element.remove()
})

function iconWithTip() {
  const holder = document.createElement('span')
  holder.dataset.tip = 'Review open'
  holder.dataset.tipKey = 'Ctrl+Shift+D'
  holder.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14"/></svg>'
  document.body.append(holder)
  return holder
}

describe('installTooltips', () => {
  it('should show the tip of the element that holds an icon when the mouse is on the icon strokes', () => {
    vi.useFakeTimers()
    const holder = iconWithTip()

    holder.querySelector('path')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(500)

    const tip = document.getElementById('tooltip')
    expect(tip?.hidden).toBe(false)
    expect(tip?.textContent).toBe('Review openCtrl+Shift+D')
    expect(holder.getAttribute('aria-describedby')).toBe('tooltip')
  })
})
