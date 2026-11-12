import {
  type Autostart,
  type Clipboard,
  type ComposeStatus,
  type ConnectionStatus,
  errorBody,
  fail,
  type GitLabConnection,
  hostChannels,
  type Logger,
  type Notifier,
  type ProjectCatalog,
  type PtyCreateOptions,
  type PtyHost,
  type PtySession,
  type RulesChange,
  type RulesView,
  type SessionActivityInfo,
  type SessionSnapshot,
  type SettingsPatch,
  type SettingsUpdate,
  type SettingsView,
} from '@dck/core'
import { z } from 'zod'
import type { ViewsGateway } from '../daemon/views-gateway.ts'

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

const ptyId = z.number().int().nonnegative()
// The limits are the ones of the rule model: an id, a variable name and an expression
const ruleId = z.string().min(1).max(64)

// The repository the page shows, which the tab must still be in
const ruleRequestSchema = z.object({ ptyId, root: z.string().min(1).max(4096) })

const ruleSwitchSchema = ruleRequestSchema.extend({ id: ruleId, enabled: z.boolean() })

const ruleFieldSchema = ruleRequestSchema.extend({
  id: ruleId,
  check: z.number().int().nonnegative(),
  name: z.string().min(1).max(64),
  value: z.union([z.string().max(500), z.number()]),
})

const agentsShareSchema = ruleRequestSchema.extend({ on: z.boolean() })

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
  // Opens in the system browser; `allowedOrigin` is the connected GitLab's origin, if any
  readonly external: { open(url: string): void; allowedOrigin(): string | null }
  readonly environment: { status(pid: number): Promise<ComposeStatus> }
  readonly sessions: {
    activity(pid: number): Promise<SessionActivityInfo | undefined>
    snapshot(pid: number): Promise<SessionSnapshot | undefined>
  }
  // Keyed by the directory the tab is in; every change goes to that repository
  readonly rules: {
    view(cwd: string): Promise<RulesView | undefined>
    // `root` is the repository the page shows; a change is refused when the tab is in another one
    setEnabled(cwd: string, root: string, id: string, enabled: boolean): Promise<RulesChange>
    setField(
      cwd: string,
      root: string,
      id: string,
      check: number,
      name: string,
      value: string | number,
    ): Promise<RulesChange>
    shareWithAgents(cwd: string, root: string, on: boolean): Promise<RulesChange>
    addClaudeImport(cwd: string, root: string): Promise<RulesChange>
  }
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
  let nextId = 1

  ipcMain.handle(hostChannels.ptyCreate, (_event, create: PtyCreateOptions) => {
    const id = nextId++
    const session = ptyHost.spawn({
      file: options.shell,
      args: [],
      cwd: create.cwd ?? options.home,
      // Qualquer script rodando neste terminal, como o statusLine do Claude, sabe a qual aba pertence
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

  async function cwdOf(id: number): Promise<string | undefined> {
    const session = sessions.get(id)
    return session && (await options.sessions.activity(session.pid))?.cwd
  }

  function handleRules<Request extends { readonly ptyId: number; readonly root: string }>(
    channel: string,
    schema: z.ZodType<Request>,
    change: (cwd: string, request: Request) => Promise<RulesChange>,
  ) {
    ipcMain.handle(channel, async (_event, payload: unknown): Promise<RulesChange> => {
      const parsed = schema.safeParse(payload)
      if (!parsed.success) {
        logger.warn('invalid rules request ignored', { channel })
        return fail(errorBody('DCK-IPC-003'))
      }
      const cwd = await cwdOf(parsed.data.ptyId)
      return cwd === undefined ? fail(errorBody('DCK-RUL-003')) : change(cwd, parsed.data)
    })
  }

  ipcMain.handle(hostChannels.rulesGet, async (_event, id: unknown) => {
    const parsed = ptyId.safeParse(id)
    const cwd = parsed.success ? await cwdOf(parsed.data) : undefined
    return cwd === undefined ? undefined : options.rules.view(cwd)
  })
  handleRules(hostChannels.rulesSetEnabled, ruleSwitchSchema, (cwd, request) =>
    options.rules.setEnabled(cwd, request.root, request.id, request.enabled),
  )
  handleRules(hostChannels.rulesSetField, ruleFieldSchema, (cwd, request) =>
    options.rules.setField(
      cwd,
      request.root,
      request.id,
      request.check,
      request.name,
      request.value,
    ),
  )
  handleRules(hostChannels.rulesShareWithAgents, agentsShareSchema, (cwd, request) =>
    options.rules.shareWithAgents(cwd, request.root, request.on),
  )
  handleRules(hostChannels.rulesAddClaudeImport, ruleRequestSchema, (cwd, request) =>
    options.rules.addClaudeImport(cwd, request.root),
  )
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
