// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTooltips, setTipRegion } from './tooltip.ts'

// The key of the new tab action, as the keymap would give it after the user changed it
let newTabKey = 'Ctrl+Shift+T'
installTooltips({ shortcutLabel: (id) => (id === 'newTab' ? newTabKey : undefined) })

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

  it('should put each line on its own when the tip has several lines', () => {
    // Arrange
    vi.useFakeTimers()
    const holder = document.createElement('span')
    holder.dataset.tip = 'Fix the parser\nAdd a fallback\n+ 2 more'
    document.body.append(holder)

    // Act
    holder.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(500)

    // Assert
    const tip = document.getElementById('tooltip')
    const lines = [...(tip?.querySelectorAll('.tip-line') ?? [])].map((line) => line.textContent)
    expect(lines).toEqual(['Fix the parser', 'Add a fallback', '+ 2 more'])
    expect(tip?.hasAttribute('data-lines')).toBe(true)
  })

  it('should show the key the action has now when the tooltip names an action', () => {
    // Arrange
    vi.useFakeTimers()
    const button = document.createElement('button')
    button.dataset.tip = 'New tab'
    button.dataset.tipShortcut = 'newTab'
    document.body.append(button)
    newTabKey = 'Ctrl+Alt+N'

    // Act
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(500)

    // Assert
    expect(document.getElementById('tooltip')?.textContent).toBe('New tabCtrl+Alt+N')
  })

  it('should draw only the modifier as a cap when the key is held for a click', () => {
    // Arrange
    vi.useFakeTimers()
    const path = document.createElement('span')
    path.dataset.tip = 'src/app.ts'
    path.dataset.tipKey = 'Ctrl'
    path.dataset.tipGesture = 'clique para abrir'
    document.body.append(path)

    // Act
    path.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(500)

    // Assert
    const tip = document.getElementById('tooltip')
    const caps = [...(tip?.querySelectorAll('kbd.key') ?? [])].map((cap) => cap.textContent)
    expect(caps).toEqual(['Ctrl'])
    expect(tip?.querySelector('.gesture')?.textContent).toBe('Ctrl+clique para abrir')
  })

  it('should show the gesture of a region when a link drawn in the terminal is hovered', () => {
    // Arrange
    vi.useFakeTimers()
    const owner = document.createElement('div')
    document.body.append(owner)
    const box = { x: 10, y: 10, width: 80, height: 16 }

    // Act
    setTipRegion(owner, { text: 'https://gitlab.example.com', key: '⌘', gesture: 'click', box })
    vi.advanceTimersByTime(500)

    // Assert
    const tip = document.getElementById('tooltip')
    expect(tip?.querySelectorAll('kbd.key')).toHaveLength(1)
    expect(tip?.textContent).toBe('https://gitlab.example.com⌘ click')
  })

  it('should keep one cap per key when the tip is a shortcut', () => {
    // Arrange
    vi.useFakeTimers()
    const holder = iconWithTip()

    // Act
    holder.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    vi.advanceTimersByTime(500)

    // Assert
    const tip = document.getElementById('tooltip')
    expect(tip?.querySelectorAll('kbd.key')).toHaveLength(3)
    expect(tip?.querySelector('.gesture')).toBeNull()
  })
})
