import type { Settings, SettingsPatch, SettingsUpdate, SettingsView } from '../settings/settings.ts'
import type { MergeRequestView } from './code-review.ts'
import type { ConnectionStatus } from './connections.ts'
import type { ComposeStatus } from './environment.ts'
import type { TabNotification } from './notifier.ts'
import type { Project } from './projects.ts'
import type { PtyExit, Unsubscribe } from './pty.ts'
import type { RulesChange, RulesView } from './rules.ts'
import type { SessionActivityInfo, SessionSnapshot } from './session.ts'
import type { ViewSnapshot } from './views.ts'

export interface PtyCreateOptions {
  readonly cols: number
  readonly rows: number
  readonly cwd?: string
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
  readonly connections: {
    readonly gitlab: {
      status(): Promise<ConnectionStatus>
      connect(url: string, token: string): Promise<ConnectionStatus>
      disconnect(): Promise<ConnectionStatus>
    }
  }
  readonly views: {
    // Undefined when the daemon does not answer
    snapshot(view: MergeRequestView): Promise<ViewSnapshot | undefined>
    // With a max age, only fetches from the server if what is stored is older
    refresh(view: MergeRequestView, maxAgeMs?: number): Promise<ViewSnapshot | undefined>
    onChange(listener: (snapshot: ViewSnapshot) => void): Unsubscribe
  }
  readonly external: {
    // Only opens addresses from the connected GitLab's origin; any other is ignored
    open(url: string): void
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
  // The rules of the repository the tab is in; every change is written in that repository
  readonly rules: {
    // Undefined when the tab is not inside a git repository
    get(ptyId: number): Promise<RulesView | undefined>
    setEnabled(ptyId: number, id: string, enabled: boolean): Promise<RulesChange>
    setField(
      ptyId: number,
      id: string,
      check: number,
      name: string,
      value: string | number,
    ): Promise<RulesChange>
    shareWithAgents(ptyId: number, on: boolean): Promise<RulesChange>
    addClaudeImport(ptyId: number): Promise<RulesChange>
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
  connectionsGitlabStatus: 'connections:gitlab:status',
  connectionsGitlabConnect: 'connections:gitlab:connect',
  connectionsGitlabDisconnect: 'connections:gitlab:disconnect',
  externalOpen: 'external:open',
  viewsSnapshot: 'views:snapshot',
  viewsRefresh: 'views:refresh',
  viewsChanged: 'views:changed',
  autostartGet: 'autostart:get',
  autostartSet: 'autostart:set',
  sessionActivity: 'session:activity',
  sessionInspect: 'session:inspect',
  rulesGet: 'rules:get',
  rulesSetEnabled: 'rules:set-enabled',
  rulesSetField: 'rules:set-field',
  rulesShareWithAgents: 'rules:share-with-agents',
  rulesAddClaudeImport: 'rules:add-claude-import',
  projectsList: 'projects:list',
  projectsTouch: 'projects:touch',
  projectsToggleFavorite: 'projects:toggle-favorite',
  windowToggleFullHeight: 'window:toggle-full-height',
  windowShown: 'window:shown',
  windowOpenSettings: 'window:open-settings',
  windowFullHeight: 'window:full-height',
} as const
