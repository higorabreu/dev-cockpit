import type { HostApi } from '@dck/core'
import { type ThemeName, tokens } from '@dck/design'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { attachClipboard } from './clipboard-behavior.ts'
import { terminalTheme } from './theme.ts'

const FIT_DELAY_MS = 60

export interface TerminalSession {
  readonly element: HTMLElement
  focus(): void
  fit(): void
  setTheme(name: ThemeName): void
  dispose(): void
}

export interface SessionOptions {
  readonly host: HTMLElement
  readonly api: HostApi
  readonly theme: ThemeName
  readonly cwd?: string
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
    fontSize: tokens.size.terminal,
    cursorBlink: true,
    allowTransparency: true,
    theme: terminalTheme(options.theme),
  })
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  terminal.open(element)

  const clipboard = attachClipboard(terminal, element, api.clipboard, options.onCopied)
  // Teclas que o xterm não deve enviar ao shell: F11 muda a altura e Ctrl+Shift+C e V copiam e colam
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    if (event.key === 'F11') {
      api.window.toggleFullHeight()
      return false
    }
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
    terminal.write('\r\n[processo encerrado]\r\n')
    options.onExit()
  })

  let fitTimer: ReturnType<typeof setTimeout> | undefined
  const observer = new ResizeObserver(() => {
    clearTimeout(fitTimer)
    fitTimer = setTimeout(() => {
      if (element.offsetParent !== null) fit.fit()
    }, FIT_DELAY_MS)
  })
  observer.observe(options.host)

  return {
    element,
    focus: () => terminal.focus(),
    fit: () => fit.fit(),
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
