import {
  type AgentSession,
  type Clipboard,
  type ComposeStatus,
  hostChannels,
  type Logger,
  type Notifier,
  type ProjectCatalog,
  type PtyCreateOptions,
  type PtyHost,
  type PtySession,
  type SessionActivityInfo,
  type SessionSnapshot,
} from '@dck/core'
import { z } from 'zod'

const notificationSchema = z.object({
  title: z.string().max(200),
  body: z.string().max(500),
  tabId: z.string().max(100),
})

export interface IpcMainApi {
  handle(channel: string, listener: (event: unknown, ...args: never[]) => unknown): void
  on(channel: string, listener: (event: unknown, ...args: never[]) => void): void
}

export interface BridgeOptions {
  readonly ipcMain: IpcMainApi
  readonly ptyHost: PtyHost
  readonly clipboard: Clipboard
  readonly projects: ProjectCatalog
  readonly notifier: Notifier
  readonly agents: { session(pid: number): Promise<AgentSession | undefined> }
  readonly environment: { status(pid: number): Promise<ComposeStatus> }
  readonly sessions: {
    activity(pid: number): Promise<SessionActivityInfo | undefined>
    snapshot(pid: number): Promise<SessionSnapshot | undefined>
  }
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
  ipcMain.on(hostChannels.notificationsShow, (_event, payload: unknown) => {
    const parsed = notificationSchema.safeParse(payload)
    if (parsed.success) {
      logger.info('notification requested', { tabId: parsed.data.tabId })
      options.notifier.notify(parsed.data)
    } else logger.warn('invalid notification request ignored')
  })
  ipcMain.handle(
    hostChannels.environmentInspect,
    async (_event, id: number): Promise<ComposeStatus> => {
      const session = sessions.get(id)
      return session ? options.environment.status(session.pid) : { kind: 'none' }
    },
  )
  ipcMain.handle(hostChannels.agentInspect, (_event, id: number) => {
    const session = sessions.get(id)
    return session ? options.agents.session(session.pid) : undefined
  })
  ipcMain.handle(hostChannels.sessionActivity, (_event, id: number) => {
    const session = sessions.get(id)
    return session ? options.sessions.activity(session.pid) : undefined
  })
  ipcMain.handle(hostChannels.sessionInspect, (_event, id: number) => {
    const session = sessions.get(id)
    return session ? options.sessions.snapshot(session.pid) : undefined
  })
  ipcMain.handle(hostChannels.projectsList, () => options.projects.list())
  ipcMain.on(hostChannels.projectsTouch, (_event, path: string) => {
    void options.projects.touch(path)
  })
  ipcMain.on(hostChannels.windowToggleFullHeight, () => options.toggleFullHeight())

  return {
    killAll() {
      for (const session of sessions.values()) session.kill()
      sessions.clear()
    },
  }
}
