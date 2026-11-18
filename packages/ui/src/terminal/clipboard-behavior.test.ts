// @vitest-environment happy-dom
import type { Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'
import { createKeymap, type Keyboard } from '../platform/keymap.ts'
import { attachClipboard } from './clipboard-behavior.ts'

function setup(nativeMiddlePaste: boolean, selection = '', keyboard: Keyboard = 'pc') {
  const pasted: string[] = []
  const menus: [number, number][] = []
  const terminal = {
    hasSelection: () => selection !== '',
    getSelection: () => selection,
    paste: (text: string) => void pasted.push(text),
    onSelectionChange: () => ({ dispose() {} }),
  } as unknown as Terminal
  const element = document.createElement('div')
  document.body.replaceChildren(element)
  const copied: string[] = []
  const clipboard = {
    readText: async () => 'from clipboard',
    writeText: async (text: string) => void copied.push(text),
  }
  const behavior = attachClipboard(terminal, element, clipboard, () => {}, {
    nativeMiddlePaste,
    keymap: createKeymap(keyboard),
    openMenu: (x, y) => void menus.push([x, y]),
  })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  return { behavior, element, pasted, copied, menus, settle }
}

const key = (init: KeyboardEventInit) =>
  new KeyboardEvent('keydown', { cancelable: true, ctrlKey: true, shiftKey: true, ...init })

describe('attachClipboard', () => {
  it('should paste once and stop the browser from pasting again when Ctrl+Shift+V is pressed', async () => {
    const { behavior, pasted, settle } = setup(true)
    const event = key({ key: 'V' })

    const passes = behavior.onKey(event)
    await settle()

    expect(passes).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(pasted).toEqual(['from clipboard'])
  })

  it('should copy the selection and keep the key from the shell when Ctrl+Shift+C is pressed with a selection', async () => {
    const { behavior, copied, settle } = setup(true, 'ls -la')

    const passes = behavior.onKey(key({ key: 'C' }))
    await settle()

    expect(passes).toBe(false)
    expect(copied).toEqual(['ls -la'])
  })

  it('should let other keys reach the terminal when they are not the clipboard shortcuts', () => {
    const { behavior } = setup(true)

    expect(behavior.onKey(key({ key: 'C' }))).toBe(true)
    expect(behavior.onKey(key({ key: 'v', shiftKey: false }))).toBe(true)
  })

  it('should leave Ctrl+Shift+C and V to the shell when the keyboard is a Mac one', () => {
    // Arrange
    const { behavior } = setup(true, 'ls -la', 'mac')

    // Act
    const passes = [behavior.onKey(key({ key: 'C' })), behavior.onKey(key({ key: 'V' }))]

    // Assert
    expect(passes).toEqual([true, true])
  })

  it('should leave the middle click to the browser when it already pastes the primary selection', async () => {
    const { element, pasted, settle } = setup(true)

    element.dispatchEvent(new MouseEvent('auxclick', { button: 1, cancelable: true }))
    await settle()

    expect(pasted).toEqual([])
  })

  it('should paste once on a middle click when the browser does not paste by itself', async () => {
    const { element, pasted, settle } = setup(false)

    element.dispatchEvent(new MouseEvent('auxclick', { button: 1, cancelable: true }))
    await settle()

    expect(pasted).toEqual(['from clipboard'])
  })

  it('should paste once on a right click when the menu would open', async () => {
    const { element, pasted, menus, settle } = setup(true)

    const event = new MouseEvent('contextmenu', { cancelable: true })
    element.dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(pasted).toEqual(['from clipboard'])
    expect(menus).toEqual([])
  })

  it('should open the menu at the pointer and paste nothing when a Mac keyboard right clicks', async () => {
    // Arrange
    const { element, pasted, menus, settle } = setup(true, '', 'mac')
    const event = new MouseEvent('contextmenu', { cancelable: true, clientX: 120, clientY: 48 })

    // Act
    element.dispatchEvent(event)
    await settle()

    // Assert
    expect(event.defaultPrevented).toBe(true)
    expect(menus).toEqual([[120, 48]])
    expect(pasted).toEqual([])
  })

  it('should keep Ctrl+click from the terminal when the keyboard is a Mac one', () => {
    // Arrange
    const { element } = setup(true, 'npm test', 'mac')
    const screen = document.createElement('div')
    element.append(screen)
    const reached: string[] = []
    screen.addEventListener('mousedown', (event) =>
      reached.push(event.ctrlKey ? 'ctrl' : event.metaKey ? 'cmd' : 'plain'),
    )
    const click = (init: MouseEventInit) =>
      screen.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, ...init }))

    // Act
    click({ ctrlKey: true })
    click({ metaKey: true })
    click({})

    // Assert
    expect(reached).toEqual(['cmd', 'plain'])
  })

  it('should let Ctrl+click reach the terminal when the keyboard is a PC one', () => {
    // Arrange
    const { element } = setup(true)
    const screen = document.createElement('div')
    element.append(screen)
    let reached = false
    screen.addEventListener('mousedown', () => {
      reached = true
    })

    // Act
    screen.dispatchEvent(new MouseEvent('mousedown', { button: 0, ctrlKey: true, bubbles: true }))

    // Assert
    expect(reached).toBe(true)
  })

  it('should copy the selection when the button is released outside the terminal', async () => {
    const { element, copied, settle } = setup(true, 'git status')

    element.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    await settle()

    expect(copied).toEqual(['git status'])
  })

  it('should stop listening on the window when the terminal is disposed', async () => {
    const { behavior, element, copied, settle } = setup(true, 'git status')

    behavior.dispose()
    element.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    await settle()

    expect(copied).toEqual([])
  })
})
