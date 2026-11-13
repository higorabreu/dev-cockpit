import type { HostApi } from '@dck/core'
import type { Terminal } from '@xterm/xterm'

const COPY_DELAY_MS = 150

export interface ClipboardOptions {
  // On Linux the browser already pastes the primary selection on a middle click; pasting again doubles it
  readonly nativeMiddlePaste: boolean
}

// Selecting copies; right and middle click paste; Ctrl+Shift+C and V as in other terminals
export function attachClipboard(
  terminal: Terminal,
  element: HTMLElement,
  clipboard: HostApi['clipboard'],
  onCopied: (text: string) => void,
  options: ClipboardOptions,
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
    if (event.button !== 1 || options.nativeMiddlePaste) return
    event.preventDefault()
    void paste()
  })

  // Keys xterm must not send to the shell: Ctrl+Shift+C and V copy and paste; false keeps them from xterm
  function onKey(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown' || !event.ctrlKey || !event.shiftKey) return true
    const key = event.key.toLowerCase()
    if (key === 'c' && terminal.hasSelection()) {
      copySelection()
      return false
    }
    if (key === 'v') {
      // Chromium pastes on Ctrl+Shift+V by itself too; without this the text arrives twice
      event.preventDefault()
      void paste()
      return false
    }
    return true
  }

  return { copySelection, paste, onKey }
}
