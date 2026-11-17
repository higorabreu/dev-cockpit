// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createTabMenu } from './tab-menu.ts'

function setup() {
  document.body.replaceChildren()
  const terminal = document.createElement('textarea')
  const element = document.createElement('div')
  element.setAttribute('role', 'menu')
  element.hidden = true
  document.body.append(terminal, element)
  terminal.focus()
  const ran: string[] = []
  const menu = createTabMenu(element)
  const open = () =>
    menu.open(
      [
        { label: 'Open in a new tab', enabled: true, run: () => void ran.push('tab') },
        { label: 'Disabled', enabled: false, run: () => void ran.push('disabled') },
        { label: 'Open in the file manager', enabled: true, run: () => void ran.push('files') },
      ],
      100,
      100,
      false,
      () => terminal.focus(),
    )
  const focused = () => document.activeElement?.textContent
  const press = (key: string) =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  return { menu, element, terminal, ran, open, focused, press }
}

describe('createTabMenu', () => {
  it('should focus the first item when it opens', () => {
    const { open, focused, element } = setup()

    open()

    expect(element.hidden).toBe(false)
    expect(focused()).toBe('Open in a new tab')
  })

  it('should move between the enabled items when the arrows are pressed', () => {
    const { open, focused, press } = setup()
    open()

    press('ArrowDown')
    const second = focused()
    press('ArrowDown')
    const wrapped = focused()
    press('ArrowUp')

    expect(second).toBe('Open in the file manager')
    expect(wrapped).toBe('Open in a new tab')
    expect(focused()).toBe('Open in the file manager')
  })

  it('should run the focused item and give the focus back when it is chosen', () => {
    const { open, press, ran, element, terminal } = setup()
    open()
    press('End')

    ;(document.activeElement as HTMLButtonElement).click()

    expect(ran).toEqual(['files'])
    expect(element.hidden).toBe(true)
    expect(document.activeElement).toBe(terminal)
  })

  it('should close without running anything and give the focus back when Escape is pressed', () => {
    const { open, press, ran, element, terminal } = setup()
    open()

    press('Escape')

    expect(ran).toEqual([])
    expect(element.hidden).toBe(true)
    expect(document.activeElement).toBe(terminal)
  })

  it('should close when the user clicks outside it', () => {
    const { open, element, terminal } = setup()
    open()

    terminal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(element.hidden).toBe(true)
  })
})
