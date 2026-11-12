import type { HostApi } from '@dck/core'
import type { Terminal } from '@xterm/xterm'

const COPY_DELAY_MS = 150

// Selecting copies; right and middle click paste; Ctrl+Shift+C and V as in other terminals
export function attachClipboard(
  terminal: Terminal,
  element: HTMLElement,
  clipboard: HostApi['clipboard'],
  onCopied: (text: string) => void,
) {
  const copySelection = () => {
    if (!terminal.hasSelection()) return
    const text = terminal.getSelection()
    void clipboard.writeText(text).then(() => onCopied(text))
  }
  const paste = async () => terminal.paste(await clipboard.readText())

  let pressed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  element.addEventListener('mousedown', (event) => {
    if (event.button === 0) pressed = true
  })
  // mouseup is listened for on the window: releasing the button outside the terminal does not reach the element
  window.addEventListener('mouseup', () => {
    if (!pressed) return
    pressed = false
    copySelection()
  })
  terminal.onSelectionChange(() => {
    if (pressed) return
    clearTimeout(timer)
    timer = setTimeout(copySelection, COPY_DELAY_MS)
  })
  element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    void paste()
  })
  element.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return
    event.preventDefault()
    void paste()
  })

  return { copySelection, paste }
}
