import type { HostApi } from '@dck/core'
import type { Terminal } from '@xterm/xterm'

const COPY_DELAY_MS = 150

// Selecionar copia; o clique direito e o do meio colam; Ctrl+Shift+C e V como nos outros terminais
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
  // O mouseup é ouvido na janela: soltar o botão fora do terminal não chega ao elemento
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
