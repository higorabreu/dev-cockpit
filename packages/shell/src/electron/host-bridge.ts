import { isAbsolute } from 'node:path'
import {
  type AgentProfile,
  type Autostart,
  type Clipboard,
  type ComposeStatus,
  type ConnectionStatus,
  type GitLabConnection,
  hostChannels,
  type Logger,
  type Notifier,
  type ProjectCatalog,
  type PtyCreateOptions,
  type PtyHost,
  type PtySession,
  type SessionActivityInfo,
  type SessionSnapshot,
  type SettingsPatch,
  type SettingsUpdate,
  type SettingsView,
} from '@dck/core'
import { z } from 'zod'
import type { ViewsGateway } from '../daemon/views-gateway.ts'
import { createTerminalPaths, type TerminalFiles } from './terminal-paths.ts'

// Each field's value is validated and corrected by the settings model itself
const patchSchema = z.record(z.string(), z.unknown())

// The token only passes through here, is never returned nor logged
const connectSchema = z.object({
  url: z.string().max(512),
  token: z.string().trim().min(1).max(512),
})

const viewRequestSchema = z.object({
  view: z.enum(['review', 'mine']),
  maxAgeMs: z.number().int().nonnegative().optional(),
})

const notificationSchema = z.object({
  title: z.string().max(200),
  body: z.string().max(500),
  tabId: z.string().max(100),
})

// Only addresses from the connected GitLab's origin; the data comes from the server, so it is not trusted
function parseOwnUrl(input: string, origin: string | null): string | undefined {
  if (origin === null) return undefined
  try {
    const url = new URL(input)
    return url.origin === new URL(origin).origin ? url.href : undefined
  } catch {
    return undefined
  }
}

// Terminal output is not trusted: only the web, no credentials in the address and a sane length
const MAX_LINK_LENGTH = 2048
const webLinkSchema = z
  .string()
  .max(MAX_LINK_LENGTH)
  .transform((text) => URL.parse(text))
  .refine(
    (url) =>
      url !== null &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === '',
  )

// Only the scheme reaches the log: the rest of a refused address may carry a token
function schemeOf(input: unknown): string {
  return (typeof input === 'string' && URL.parse(input)?.protocol) || 'invalid'
}

// Paths come from terminal output: few per call, short, no NUL, and the base and targets absolute
const MAX_PATHS_PER_CALL = 50
const MAX_CANDIDATE_LENGTH = 1024
const MAX_ABSOLUTE_LENGTH = 4096
const pathText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((text) => !text.includes('\0'))
const absolutePathSchema = pathText(MAX_ABSOLUTE_LENGTH).refine((text) => isAbsolute(text))
const resolvePathsSchema = z.object({
  base: absolutePathSchema.optional(),
  paths: z.array(pathText(MAX_CANDIDATE_LENGTH)).max(MAX_PATHS_PER_CALL),
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
  readonly settings: {
    get(): SettingsView
    update(patch: SettingsPatch): Promise<SettingsUpdate>
  }
  readonly autostart: Autostart
  readonly gitlab: GitLabConnection
  readonly views: ViewsGateway
  // Opens in the system browser; `allowedOrigin` is the connected GitLab's origin, if any, and only limits `open`
  readonly external: { open(url: string): void; allowedOrigin(): string | null }
  readonly environment: { status(pid: number): Promise<ComposeStatus> }
  readonly files: TerminalFiles
  readonly sessions: {
    activity(pid: number): Promise<SessionActivityInfo | undefined>
    snapshot(pid: number): Promise<SessionSnapshot | undefined>
  }
  readonly agents: readonly AgentProfile[]
  readonly shell: string
  readonly home: string
  readonly logger: Logger
  send(channel: string, ...args: unknown[]): void
  toggleFullHeight(): void
}

// Wires the preload channels to the ports: PTY, clipboard and window
export function registerHostBridge(options: BridgeOptions) {
  const { ipcMain, ptyHost, clipboard, logger, send } = options
  const sessions = new Map<number, PtySession>()
  const paths = createTerminalPaths({ files: options.files, home: options.home, logger })
  let nextId = 1

  ipcMain.handle(hostChannels.ptyCreate, (_event, create: PtyCreateOptions) => {
    const id = nextId++
    const session = ptyHost.spawn({
      file: options.shell,
      args: [],
      cwd: create.cwd ?? options.home,
      // Anything running in this terminal, like an agent's hooks, knows which tab it belongs to
      env: { DCK_PTY_ID: String(id) },
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
  ipcMain.handle(hostChannels.settingsGet, () => options.settings.get())
  ipcMain.handle(hostChannels.settingsUpdate, (_event, patch: unknown) =>
    options.settings.update(patchSchema.parse(patch) as SettingsPatch),
  )
  ipcMain.handle(hostChannels.connectionsGitlabStatus, () => options.gitlab.status())
  ipcMain.handle(hostChannels.connectionsGitlabConnect, (_event, payload: unknown) => {
    const parsed = connectSchema.safeParse(payload)
    if (!parsed.success) {
      logger.warn('invalid gitlab connect request ignored')
      return { kind: 'error', url: undefined, code: 'DCK-GLB-007' } satisfies ConnectionStatus
    }
    return options.gitlab.connect(parsed.data.url, parsed.data.token)
  })
  ipcMain.handle(hostChannels.connectionsGitlabDisconnect, () => options.gitlab.disconnect())
  ipcMain.on(hostChannels.externalOpen, (_event, url: unknown) => {
    const origin = options.external.allowedOrigin()
    const target = typeof url === 'string' ? parseOwnUrl(url, origin) : undefined
    if (target) options.external.open(target)
    else logger.warn('external address refused', { origin })
  })
  ipcMain.on(hostChannels.externalOpenLink, (_event, url: unknown) => {
    const parsed = webLinkSchema.safeParse(url)
    if (parsed.success && parsed.data) options.external.open(parsed.data.href)
    else logger.warn('terminal link refused', { scheme: schemeOf(url) })
  })
  ipcMain.handle(hostChannels.pathsResolve, (_event, request: unknown) => {
    const parsed = resolvePathsSchema.safeParse(request)
    if (parsed.success) return paths.resolve(parsed.data.base, parsed.data.paths)
    logger.warn('terminal path request refused', { kind: 'resolve' })
    return []
  })
  const openRequest =
    (kind: 'file' | 'dir', open: (path: string) => Promise<void>) =>
    (_event: unknown, path: unknown) => {
      const parsed = absolutePathSchema.safeParse(path)
      if (parsed.success) return open(parsed.data)
      logger.warn('terminal path request refused', { kind })
      return undefined
    }
  ipcMain.on(hostChannels.pathsOpenFile, openRequest('file', paths.openFile))
  ipcMain.on(hostChannels.pathsOpenFolder, openRequest('dir', paths.openFolder))
  ipcMain.handle(hostChannels.viewsSnapshot, (_event, view: unknown) => {
    const parsed = viewRequestSchema.shape.view.safeParse(view)
    return parsed.success ? options.views.snapshot(parsed.data) : undefined
  })
  ipcMain.handle(hostChannels.viewsRefresh, (_event, payload: unknown) => {
    const parsed = viewRequestSchema.safeParse(payload)
    return parsed.success
      ? options.views.refresh(parsed.data.view, parsed.data.maxAgeMs)
      : undefined
  })
  ipcMain.handle(hostChannels.autostartGet, () => options.autostart.isEnabled())
  ipcMain.handle(hostChannels.autostartSet, async (_event, enabled: unknown) => {
    await options.autostart.setEnabled(enabled === true)
    return options.autostart.isEnabled()
  })
  ipcMain.handle(
    hostChannels.environmentInspect,
    async (_event, id: number): Promise<ComposeStatus> => {
      const session = sessions.get(id)
      return session ? options.environment.status(session.pid) : { kind: 'none' }
    },
  )

  ipcMain.handle(hostChannels.sessionActivity, (_event, id: number) => {
    const session = sessions.get(id)
    return session ? options.sessions.activity(session.pid) : undefined
  })
  ipcMain.handle(hostChannels.sessionInspect, (_event, id: number) => {
    const session = sessions.get(id)
    return session ? options.sessions.snapshot(session.pid) : undefined
  })
  ipcMain.handle(hostChannels.agentProfiles, () => options.agents)
  ipcMain.handle(hostChannels.projectsList, () => options.projects.list())
  ipcMain.handle(hostChannels.projectsToggleFavorite, (_event, path: string) =>
    options.projects.toggleFavorite(path),
  )
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
