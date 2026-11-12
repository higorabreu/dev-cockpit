// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createFocusKeeper } from './focus-keeper.ts'

// A screen that draws two inputs from its saved values, as the settings screen does
function arrange(saved = { name: 'feat, fix', other: 'main' }) {
  const root = document.createElement('div')
  document.body.replaceChildren(root)
  const keeper = createFocusKeeper(root)
  const draw = () => {
    const inputs = Object.entries(saved).map(([key, value]) => {
      const input = document.createElement('input')
      input.setAttribute('data-focus', key)
      input.value = value
      return input
    })
    root.replaceChildren(...inputs)
  }
  draw()
  const input = (key: string) => root.querySelector<HTMLInputElement>(`[data-focus="${key}"]`)
  return { keeper, draw, input }
}

describe('createFocusKeeper', () => {
  it('should focus the new control and keep its whole value selected when the screen is drawn again', () => {
    const { keeper, draw, input } = arrange()
    input('other')?.focus()
    input('other')?.setSelectionRange(0, 4)

    keeper.redraw(draw)

    expect(document.activeElement).toBe(input('other'))
    expect([input('other')?.selectionStart, input('other')?.selectionEnd]).toEqual([0, 4])
  })

  it('should keep what was typed when the screen is drawn again before the change is saved', () => {
    const { keeper, draw, input } = arrange()
    const typed = input('name')
    typed?.focus()
    if (typed) typed.value = 'feat, fix, do'
    typed?.dispatchEvent(new Event('input', { bubbles: true }))

    keeper.redraw(draw)

    expect(input('name')).not.toBe(typed)
    expect(input('name')?.value).toBe('feat, fix, do')
  })

  it('should show the saved value when the change was already sent', () => {
    const { keeper, draw, input } = arrange()
    const typed = input('name')
    typed?.focus()
    if (typed) typed.value = 'feat,fix'
    typed?.dispatchEvent(new Event('input', { bubbles: true }))
    typed?.dispatchEvent(new Event('change', { bubbles: true }))

    keeper.redraw(draw)

    expect(input('name')?.value).toBe('feat, fix')
  })
})
