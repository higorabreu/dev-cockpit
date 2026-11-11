import type { HostApi } from '@dck/core'
import { type ThemeName, tokens } from '@dck/design'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { attachClipboard } from './clipboard-behavior.ts'
import { terminalTheme } from './theme.ts'

export interface TerminalSession {
  readonly element: HTMLElement
  readonly ptyId: number
  focus(): void
  write(data: string): void
  fit(): void
  setTheme(name: ThemeName): void
  setFontSize(size: number): void
  dispose(): void
}

export interface SessionOptions {
  readonly host: HTMLElement
  readonly api: HostApi
  readonly theme: ThemeName
  readonly fontSize: number
  readonly cwd?: string
  readonly exitedText: string
  onCopied(text: string): void
  onExit(): void
}

export async function createTerminalSession(options: SessionOptions): Promise<TerminalSession> {
  const { api } = options
  const element = document.createElement('div')
  element.className = 'session'
  options.host.appendChild(element)

  const terminal = new Terminal({
    fontFamily: tokens.font.mono,
    fontSize: options.fontSize,
    cursorBlink: true,
    allowTransparency: true,
    theme: terminalTheme(options.theme),
  })
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  terminal.open(element)

  const clipboard = attachClipboard(terminal, element, api.clipboard, options.onCopied)
  // Teclas que o xterm não deve enviar ao shell: Ctrl+Shift+C e V copiam e colam
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    if (!event.ctrlKey || !event.shiftKey) return true
    const key = event.key.toLowerCase()
    if (key === 'c' && terminal.hasSelection()) {
      clipboard.copySelection()
      return false
    }
    if (key === 'v') {
      void clipboard.paste()
      return false
    }
    return true
  })

  // A aba precisa estar visível para o xterm medir as colunas; quem chama mostra antes de criar
  fit.fit()
  const id = await api.pty.create({
    cols: terminal.cols,
    rows: terminal.rows,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  })
  terminal.onData((data) => api.pty.write(id, data))
  terminal.onResize(({ cols, rows }) => api.pty.resize(id, cols, rows))
  const stopData = api.pty.onData((sessionId, data) => {
    if (sessionId === id) terminal.write(data)
  })
  const stopExit = api.pty.onExit((sessionId) => {
    if (sessionId !== id) return
    terminal.write(`\r\n${options.exitedText}\r\n`)
    options.onExit()
  })

  // Ajusta no próximo frame: esperar mais deixa o conteúdo transbordar e a scrollbar pisca
  let fitFrame = 0
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(fitFrame)
    fitFrame = requestAnimationFrame(() => {
      if (element.offsetParent !== null) fit.fit()
    })
  })
  observer.observe(options.host)

  return {
    element,
    ptyId: id,
    focus: () => terminal.focus(),
    write: (data) => api.pty.write(id, data),
    fit: () => fit.fit(),
    setFontSize: (size) => {
      terminal.options.fontSize = size
      fit.fit()
    },
    setTheme: (name) => {
      terminal.options.theme = terminalTheme(name)
    },
    dispose() {
      stopData()
      stopExit()
      observer.disconnect()
      api.pty.kill(id)
      terminal.dispose()
      element.remove()
    },
  }
}
