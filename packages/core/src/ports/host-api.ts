import type { AboutLink } from '../about/about.ts'
import type { AgentSignal } from '../attention/agent-signal.ts'
import type { Connector } from '../connectors/connector.ts'
import type { DiffFile } from '../diff/diff.ts'
import type { SystemFontsInfo } from '../fonts/fonts.ts'
import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'
import type { Settings, SettingsPatch, SettingsUpdate, SettingsView } from '../settings/settings.ts'
import type { SettingsFileState } from '../settings/settings-file.ts'
import type { SavedTabs } from '../tabs/saved-tabs.ts'
import type { UpdateState } from '../updates/updater.ts'
import type { AgentProfile } from './agent.ts'
import type { ConnectionFields, ConnectionStatus, DisabledConnector } from './connections.ts'
import type { DiffOutcome, DiffRequest } from './diff-source.ts'
import type { ComposeStatus } from './environment.ts'
import type { TabNotification } from './notifier.ts'
import type { FileListing, GitOthers, WalkResult } from './project-files.ts'
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
    // Only the output and the exit of the terminal with this id
    onData(id: number, listener: (data: string) => void): Unsubscribe
    onExit(id: number, listener: (exit: PtyExit) => void): Unsubscribe
  }
  readonly clipboard: {
    readText(): Promise<string>
    writeText(text: string): Promise<void>
  }
  readonly files: {
    // Where a file or folder dropped on the window lives on disk (a DOM File); empty when it has no path
    pathOf(file: object): string
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
    // Whether settings.json reads and which of its values were not used as written
    onFile(listener: (file: SettingsFileState) => void): Unsubscribe
    // In the system's default editor, written first when there is none; false when nothing opened it
    openFile(): Promise<boolean>
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
  // What changed in the repository of a tab's folder, read only
  readonly review: {
    diff(request: DiffRequest): Promise<Result<DiffOutcome, ErrorBody>>
    // An untracked file listed without its content, only for a root a diff answered with
    untrackedFile(
      root: string,
      path: string,
      ignoreWhitespace: boolean,
    ): Promise<Result<DiffFile, ErrorBody>>
    // Only for a root a diff answered with, and a path inside it
    fileLines(root: string, path: string): Promise<Result<readonly string[], ErrorBody>>
    // Changes when the diff of the folder's repository may have changed; undefined when unknown
    fingerprint(cwd: string): Promise<string | undefined>
    // Writes the pending comments for the agent, only for a root a diff answered with; the file's path
    saveNotes(root: string, markdown: string): Promise<Result<string, ErrorBody>>
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
  // The files of a tab's folder for the file search, names only, never content
  readonly fileSearch: {
    // Git's view of the folder's repository (its tracked files first), or a bounded walk outside one
    list(cwd: string): Promise<FileListing>
    // The untracked and ignored files of a root a partial listing named; empty for any other folder
    others(root: string): Promise<GitOthers>
    // A closed ignored folder a listing named, two levels at a time; empty for any other folder
    expand(root: string, folder: string): Promise<WalkResult>
  }
  readonly projects: {
    list(): Promise<readonly Project[]>
    touch(path: string): void
    toggleFavorite(path: string): Promise<boolean>
    // The system folder picker; undefined when the user cancels
    chooseRoot(): Promise<string | undefined>
  }
  // The user's terminal font, the system's monospace font and the installed families
  readonly fonts: {
    system(): Promise<SystemFontsInfo>
  }
  // The tabs of the last run, kept for the next start
  readonly tabs: {
    saved(): Promise<SavedTabs | undefined>
    save(tabs: SavedTabs): void
  }
  // The About page: the version that runs, and its links opened by name, the host knowing the addresses
  readonly about: {
    version(): Promise<string>
    open(link: AboutLink): void
  }
  // The cockpit's own releases; nothing takes an argument, the host knows the release and its files
  readonly updates: {
    state(): Promise<UpdateState>
    // Does nothing while `system.updates` is off
    check(): Promise<UpdateState>
    install(): void
    dismiss(): void
    // The release's page in the browser
    openRelease(): void
    // The window saves its tabs first; the host waits for that write, relaunches and quits
    restart(): void
    onChange(listener: (state: UpdateState) => void): Unsubscribe
  }
  // ⌘Q on a Mac while a tab runs a program: the host shows the window and asks it to confirm
  readonly quit: {
    onAsk(listener: (running: number) => void): Unsubscribe
    // True quits; false keeps the cockpit open
    answer(quit: boolean): void
  }
  readonly window: {
    toggleFullHeight(): void
    // The bottom edge dragged to this height in pixels; the fraction of the screen it takes, or undefined
    // when the height is locked
    resize(height: number): Promise<number | undefined>
    // Kept, the dragged height is saved; dropped, the window goes back to how it was
    endResize(keep: boolean): void
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
  settingsFile: 'settings:file',
  settingsOpenFile: 'settings:open-file',
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
  reviewDiff: 'review:diff',
  reviewFile: 'review:file',
  reviewUntracked: 'review:untracked',
  reviewFingerprint: 'review:fingerprint',
  reviewNotes: 'review:notes',
  autostartGet: 'autostart:get',
  autostartSet: 'autostart:set',
  sessionActivity: 'session:activity',
  sessionInspect: 'session:inspect',
  agentSignal: 'agent:signal',
  agentProfiles: 'agent:profiles',
  fileSearchList: 'file-search:list',
  fileSearchOthers: 'file-search:others',
  fileSearchExpand: 'file-search:expand',
  projectsList: 'projects:list',
  projectsTouch: 'projects:touch',
  projectsToggleFavorite: 'projects:toggle-favorite',
  projectsChooseRoot: 'projects:choose-root',
  fontsSystem: 'fonts:system',
  tabsSaved: 'tabs:saved',
  tabsSave: 'tabs:save',
  aboutVersion: 'about:version',
  aboutOpen: 'about:open',
  updatesState: 'updates:state',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesDismiss: 'updates:dismiss',
  updatesOpenRelease: 'updates:open-release',
  updatesRestart: 'updates:restart',
  updatesChanged: 'updates:changed',
  quitAsk: 'quit:ask',
  quitAnswer: 'quit:answer',
  windowToggleFullHeight: 'window:toggle-full-height',
  windowResize: 'window:resize',
  windowResizeEnd: 'window:resize-end',
  windowShown: 'window:shown',
  windowOpenSettings: 'window:open-settings',
  windowFullHeight: 'window:full-height',
} as const
