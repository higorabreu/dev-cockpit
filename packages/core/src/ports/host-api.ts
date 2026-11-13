import type { AgentSignal } from '../attention/agent-signal.ts'
import type { Connector } from '../connectors/connector.ts'
import type { Settings, SettingsPatch, SettingsUpdate, SettingsView } from '../settings/settings.ts'
import type { AgentProfile } from './agent.ts'
import type { ConnectionFields, ConnectionStatus, DisabledConnector } from './connections.ts'
import type { ComposeStatus } from './environment.ts'
import type { TabNotification } from './notifier.ts'
import type { Project } from './projects.ts'
import type { PtyExit, Unsubscribe } from './pty.ts'
import type { SessionActivityInfo, SessionSnapshot } from './session.ts'
import type { ViewSnapshot } from './views.ts'

export interface PtyCreateOptions {
  readonly cols: number
  readonly rows: number
  readonly cwd?: string
}

// What a path printed in a terminal is on disk; anything that is neither a file nor a folder is `missing`
export type PathKind = 'file' | 'dir' | 'missing'

export interface ResolvedPath {
  // Absolute, with `~` and the base directory applied by the host
  readonly path: string
  readonly kind: PathKind
}

// What the UI can ask the main process; the preload exposes this as window.dck
export interface HostApi {
  readonly pty: {
    create(options: PtyCreateOptions): Promise<number>
    write(id: number, data: string): void
    resize(id: number, cols: number, rows: number): void
    kill(id: number): void
    onData(listener: (id: number, data: string) => void): Unsubscribe
    onExit(listener: (id: number, exit: PtyExit) => void): Unsubscribe
  }
  readonly clipboard: {
    readText(): Promise<string>
    writeText(text: string): Promise<void>
  }
  readonly notifications: {
    show(notification: TabNotification): void
    onClick(listener: (tabId: string) => void): Unsubscribe
  }
  readonly environment: {
    inspect(ptyId: number): Promise<ComposeStatus>
  }
  readonly settings: {
    get(): Promise<SettingsView>
    update(patch: SettingsPatch): Promise<SettingsUpdate>
    onChange(listener: (settings: Settings, changed: readonly string[]) => void): Unsubscribe
  }
  // By connector id; only the enabled connectors this app implements are listed or answered
  readonly connections: {
    list(): Promise<readonly Connector[]>
    // Disabled in `extensions.disabled`; the settings model enables them again
    disabled(): Promise<readonly DisabledConnector[]>
    status(id: string): Promise<ConnectionStatus>
    connect(id: string, fields: ConnectionFields, token: string): Promise<ConnectionStatus>
    disconnect(id: string): Promise<ConnectionStatus>
  }
  // By view id, as the connectors declared them
  readonly views: {
    // Undefined when the daemon does not answer
    snapshot(view: string): Promise<ViewSnapshot | undefined>
    // With a max age, only fetches from the server if what is stored is older
    refresh(view: string, maxAgeMs?: number): Promise<ViewSnapshot | undefined>
    onChange(listener: (snapshot: ViewSnapshot) => void): Unsubscribe
  }
  readonly external: {
    // Only opens addresses from the origin of a connected account; any other is ignored
    open(url: string): void
    // Any http or https link the user Ctrl+clicked in a terminal; anything else is refused
    openLink(url: string): void
  }
  readonly paths: {
    // Paths printed in a terminal, in order; relative ones against `base`, the tab's directory
    resolve(base: string | undefined, paths: readonly string[]): Promise<readonly ResolvedPath[]>
    // With the system's default app; a file that could run is only shown in its folder
    openFile(path: string): void
    // In the system's file manager
    openFolder(path: string): void
  }
  readonly autostart: {
    isEnabled(): Promise<boolean>
    set(enabled: boolean): Promise<boolean>
  }
  readonly session: {
    // Lightweight, no git: used to watch every tab
    activity(ptyId: number): Promise<SessionActivityInfo | undefined>
    inspect(ptyId: number): Promise<SessionSnapshot | undefined>
  }
  readonly agent: {
    // A coding agent in one of the terminals said what it is doing
    onSignal(listener: (signal: AgentSignal) => void): Unsubscribe
    // The agents the cockpit recognizes, with how to connect each one
    profiles(): Promise<readonly AgentProfile[]>
  }
  readonly projects: {
    list(): Promise<readonly Project[]>
    touch(path: string): void
    toggleFavorite(path: string): Promise<boolean>
  }
  readonly window: {
    toggleFullHeight(): void
    onShown(listener: () => void): Unsubscribe
    // The tray asks to open the settings screen inside the window
    onOpenSettings(listener: () => void): Unsubscribe
    onFullHeightChange(listener: (fullHeight: boolean) => void): Unsubscribe
  }
}

export const hostChannels = {
  ptyCreate: 'pty:create',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',
  notificationsShow: 'notifications:show',
  notificationsClick: 'notifications:click',
  environmentInspect: 'environment:inspect',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',
  connectionsList: 'connections:list',
  connectionsDisabled: 'connections:disabled',
  connectionsStatus: 'connections:status',
  connectionsConnect: 'connections:connect',
  connectionsDisconnect: 'connections:disconnect',
  externalOpen: 'external:open',
  externalOpenLink: 'external:open-link',
  pathsResolve: 'paths:resolve',
  pathsOpenFile: 'paths:open-file',
  pathsOpenFolder: 'paths:open-folder',
  viewsSnapshot: 'views:snapshot',
  viewsRefresh: 'views:refresh',
  viewsChanged: 'views:changed',
  autostartGet: 'autostart:get',
  autostartSet: 'autostart:set',
  sessionActivity: 'session:activity',
  sessionInspect: 'session:inspect',
  agentSignal: 'agent:signal',
  agentProfiles: 'agent:profiles',
  projectsList: 'projects:list',
  projectsTouch: 'projects:touch',
  projectsToggleFavorite: 'projects:toggle-favorite',
  windowToggleFullHeight: 'window:toggle-full-height',
  windowShown: 'window:shown',
  windowOpenSettings: 'window:open-settings',
  windowFullHeight: 'window:full-height',
} as const
