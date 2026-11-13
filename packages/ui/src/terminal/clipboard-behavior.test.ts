// @vitest-environment happy-dom
import type { Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'
import { attachClipboard } from './clipboard-behavior.ts'

function setup(nativeMiddlePaste: boolean, selection = '') {
  const pasted: string[] = []
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
  const behavior = attachClipboard(terminal, element, clipboard, () => {}, { nativeMiddlePaste })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  return { behavior, element, pasted, copied, settle }
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
    const { element, pasted, settle } = setup(true)

    const event = new MouseEvent('contextmenu', { cancelable: true })
    element.dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(pasted).toEqual(['from clipboard'])
  })
})
