import type { HostApi, PaneGrid } from '@dck/core'
import { type ThemeName, tokens } from '@dck/design'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { terminalTheme } from '../platform/theme.ts'
import { attachClipboard } from './clipboard-behavior.ts'
import { attachLinks, type LinkOptions } from './terminal-links.ts'
import { attachPaths, type PathLinkOptions } from './terminal-paths.ts'

export interface TerminalSession {
  readonly element: HTMLElement
  readonly ptyId: number
  // When the terminal last wrote anything, in milliseconds since 1970
  lastOutputAt(): number
  focus(): void
  write(data: string): void
  fit(): void
  // The real cell size of the font and the padding around the cells, while the terminal is on screen
  grid(): PaneGrid | undefined
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
  // How a file or folder path printed in the terminal opens; the host checks it on disk
  readonly paths: Omit<PathLinkOptions, 'resolve' | 'openFile'>
  // How a link printed in the terminal opens and shows its tooltip
  readonly links: Omit<LinkOptions, 'open'>
  readonly nativeMiddlePaste: boolean
  onCopied(text: string): void
  onExit(): void
  // A key the user typed, not the replies xterm sends by itself (focus and cursor reports)
  onInput?(): void
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
  attachPaths(terminal, {
    ...options.paths,
    resolve: (base, paths) => api.paths.resolve(base, paths),
    openFile: (path) => api.paths.openFile(path),
  })

  attachLinks(terminal, { ...options.links, open: (url) => api.external.openLink(url) })
  const clipboard = attachClipboard(terminal, element, api.clipboard, options.onCopied, {
    nativeMiddlePaste: options.nativeMiddlePaste,
  })
  terminal.attachCustomKeyEventHandler(clipboard.onKey)

  // The tab must be visible for xterm to measure the columns; the caller shows it before creating
  fit.fit()
  const id = await api.pty.create({
    cols: terminal.cols,
    rows: terminal.rows,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  })
  terminal.onData((data) => api.pty.write(id, data))
  terminal.onKey(() => options.onInput?.())
  terminal.onResize(({ cols, rows }) => api.pty.resize(id, cols, rows))
  let lastOutputAt = Date.now()
  const stopData = api.pty.onData((sessionId, data) => {
    if (sessionId !== id) return
    lastOutputAt = Date.now()
    terminal.write(data)
  })
  const stopExit = api.pty.onExit((sessionId) => {
    if (sessionId !== id) return
    terminal.write(`\r\n${options.exitedText}\r\n`)
    options.onExit()
  })

  // Fits on the next frame: waiting longer lets the content overflow and the scrollbar flickers
  let fitFrame = 0
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(fitFrame)
    fitFrame = requestAnimationFrame(() => {
      if (element.offsetParent !== null) fit.fit()
    })
  })
  // The pane, not the tab: a split changes the terminal's width while the tab keeps its own
  observer.observe(element)

  // The fit leaves this strip for xterm's scrollbar (its default width) beside the columns
  const SCROLLBAR = 14
  let lastGrid: PaneGrid | undefined
  function grid(): PaneGrid | undefined {
    const screen = element.querySelector<HTMLElement>('.xterm-screen')
    if (!screen || screen.clientWidth === 0 || terminal.cols === 0 || terminal.rows === 0) {
      return lastGrid
    }
    const style = getComputedStyle(element)
    const pad = (a: string, b: string) => (Number.parseFloat(a) || 0) + (Number.parseFloat(b) || 0)
    lastGrid = {
      cellWidth: screen.clientWidth / terminal.cols,
      cellHeight: screen.clientHeight / terminal.rows,
      frameWidth: pad(style.paddingLeft, style.paddingRight) + SCROLLBAR,
      frameHeight: pad(style.paddingTop, style.paddingBottom),
    }
    return lastGrid
  }

  return {
    element,
    ptyId: id,
    grid,
    lastOutputAt: () => lastOutputAt,
    focus: () => terminal.focus(),
    write: (data) => api.pty.write(id, data),
    fit: () => fit.fit(),
    setFontSize: (size) => {
      terminal.options.fontSize = size
      lastGrid = undefined
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
