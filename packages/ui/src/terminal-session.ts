import type { HostApi } from '@dck/core'
import { type ThemeName, tokens } from '@dck/design'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { attachClipboard } from './clipboard-behavior.ts'
import { terminalTheme } from './theme.ts'

const FIT_DELAY_MS = 60

export async function openTerminal(host: HTMLElement, api: HostApi, theme: ThemeName) {
  const terminal = new Terminal({
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.terminal,
    cursorBlink: true,
    allowTransparency: true,
    theme: terminalTheme(theme),
  })
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  terminal.open(host)
  fit.fit()

  const clipboard = attachClipboard(terminal, host, api.clipboard)
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

  const id = await api.pty.create({ cols: terminal.cols, rows: terminal.rows })
  terminal.onData((data) => api.pty.write(id, data))
  terminal.onResize(({ cols, rows }) => api.pty.resize(id, cols, rows))
  api.pty.onData((sessionId, data) => {
    if (sessionId === id) terminal.write(data)
  })
  api.pty.onExit((sessionId) => {
    if (sessionId === id) terminal.write('\r\n[processo encerrado]\r\n')
  })

  let fitTimer: ReturnType<typeof setTimeout> | undefined
  new ResizeObserver(() => {
    clearTimeout(fitTimer)
    fitTimer = setTimeout(() => fit.fit(), FIT_DELAY_MS)
  }).observe(host)

  terminal.focus()
  return { terminal, setTheme: (name: ThemeName) => (terminal.options.theme = terminalTheme(name)) }
}
