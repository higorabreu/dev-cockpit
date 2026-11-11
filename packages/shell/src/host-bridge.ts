import {
  type Clipboard,
  hostChannels,
  type Logger,
  type ProjectCatalog,
  type PtyCreateOptions,
  type PtyHost,
  type PtySession,
} from '@dck/core'

export interface IpcMainApi {
  handle(channel: string, listener: (event: unknown, ...args: never[]) => unknown): void
  on(channel: string, listener: (event: unknown, ...args: never[]) => void): void
}

export interface BridgeOptions {
  readonly ipcMain: IpcMainApi
  readonly ptyHost: PtyHost
  readonly clipboard: Clipboard
  readonly projects: ProjectCatalog
  readonly shell: string
  readonly home: string
  readonly logger: Logger
  send(channel: string, ...args: unknown[]): void
  toggleFullHeight(): void
}

// Liga os canais do preload às portas: PTY, clipboard e janela
export function registerHostBridge(options: BridgeOptions) {
  const { ipcMain, ptyHost, clipboard, logger, send } = options
  const sessions = new Map<number, PtySession>()
  let nextId = 1

  ipcMain.handle(hostChannels.ptyCreate, (_event, create: PtyCreateOptions) => {
    const id = nextId++
    const session = ptyHost.spawn({
      file: options.shell,
      args: [],
      cwd: create.cwd ?? options.home,
      cols: create.cols,
      rows: create.rows,
    })
    session.onData((data) => send(hostChannels.ptyData, id, data))
    session.onExit((exit) => {
      sessions.delete(id)
      send(hostChannels.ptyExit, id, exit)
    })
    sessions.set(id, session)
    logger.info('pty created', { id, pid: session.pid })
    return id
  })
  ipcMain.on(hostChannels.ptyWrite, (_event, id: number, data: string) =>
    sessions.get(id)?.write(data),
  )
  ipcMain.on(hostChannels.ptyResize, (_event, id: number, cols: number, rows: number) =>
    sessions.get(id)?.resize(cols, rows),
  )
  ipcMain.on(hostChannels.ptyKill, (_event, id: number) => {
    sessions.get(id)?.kill()
    sessions.delete(id)
  })
  ipcMain.handle(hostChannels.clipboardRead, () => clipboard.readText())
  ipcMain.handle(hostChannels.clipboardWrite, (_event, text: string) => clipboard.writeText(text))
  ipcMain.handle(hostChannels.projectsList, () => options.projects.list())
  ipcMain.on(hostChannels.windowToggleFullHeight, () => options.toggleFullHeight())

  return {
    killAll() {
      for (const session of sessions.values()) session.kill()
      sessions.clear()
    },
  }
}
