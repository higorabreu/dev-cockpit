// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { attachDrop } from './terminal-drop.ts'

const where = new Map<string, string>([
  ['shot one.png', '/home/ana/Pictures/shot one.png'],
  ['acme', '/home/ana/acme'],
])

function setup() {
  const element = document.createElement('div')
  document.body.replaceChildren(element)
  const pasted: string[] = []
  let focused = 0
  const drop = attachDrop(element, {
    pathOf: (file) => where.get(file.name) ?? '',
    paste: (text) => void pasted.push(text),
    focus: () => void focused++,
  })
  return { element, pasted, focused: () => focused, drop }
}

function dragEvent(type: string, data: { files?: string[]; text?: string }) {
  const transfer = new DataTransfer()
  for (const name of data.files ?? []) transfer.items.add(new File(['x'], name))
  if (data.text !== undefined) transfer.setData('text/plain', data.text)
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  return event
}

describe('attachDrop', () => {
  it('should type the quoted paths and focus the terminal when files and folders are dropped', () => {
    // Arrange
    const { element, pasted, focused } = setup()
    const event = dragEvent('drop', { files: ['shot one.png', 'acme'] })

    // Act
    element.dispatchEvent(event)

    // Assert
    expect(event.defaultPrevented).toBe(true)
    expect(pasted).toEqual(["'/home/ana/Pictures/shot one.png' /home/ana/acme "])
    expect(focused()).toBe(1)
  })

  it('should type the text when text is dropped', () => {
    const { element, pasted } = setup()

    element.dispatchEvent(dragEvent('drop', { text: 'git status' }))

    expect(pasted).toEqual(['git status'])
  })

  it('should type nothing when the dropped file has no path on disk', () => {
    const { element, pasted } = setup()

    element.dispatchEvent(dragEvent('drop', { files: ['from-a-browser.png'] }))

    expect(pasted).toEqual([])
  })

  it('should accept the drag and mark the terminal while a file is over it', () => {
    const { element } = setup()
    const over = dragEvent('dragover', { files: ['acme'] })

    element.dispatchEvent(over)
    const marked = element.classList.contains('dropping')
    element.dispatchEvent(dragEvent('drop', { files: ['acme'] }))

    expect(over.defaultPrevented).toBe(true)
    expect(marked).toBe(true)
    expect(element.classList.contains('dropping')).toBe(false)
  })

  it('should stop listening when the terminal is disposed', () => {
    const { element, pasted, drop } = setup()

    drop.dispose()
    element.dispatchEvent(dragEvent('drop', { files: ['acme'] }))

    expect(pasted).toEqual([])
  })
})
