import type { Settings, SettingsPatch, SettingsUpdate, SettingsView } from '../settings/settings.ts'
import type { ComposeStatus } from './environment.ts'
import type { TabNotification } from './notifier.ts'
import type { Project } from './projects.ts'
import type { PtyExit, Unsubscribe } from './pty.ts'
import type { SessionActivityInfo, SessionSnapshot } from './session.ts'

export interface PtyCreateOptions {
  readonly cols: number
  readonly rows: number
  readonly cwd?: string
}

// O que a interface pode pedir ao processo principal; o preload expõe isto como window.dck
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
  readonly autostart: {
    isEnabled(): Promise<boolean>
    set(enabled: boolean): Promise<boolean>
  }
  readonly session: {
    // Leve, sem git: serve para vigiar todas as abas
    activity(ptyId: number): Promise<SessionActivityInfo | undefined>
    inspect(ptyId: number): Promise<SessionSnapshot | undefined>
  }
  readonly projects: {
    list(): Promise<readonly Project[]>
    touch(path: string): void
    toggleFavorite(path: string): Promise<boolean>
  }
  readonly window: {
    toggleFullHeight(): void
    onShown(listener: () => void): Unsubscribe
    // O tray pede para abrir a tela de configurações dentro da janela
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
  autostartGet: 'autostart:get',
  autostartSet: 'autostart:set',
  sessionActivity: 'session:activity',
  sessionInspect: 'session:inspect',
  projectsList: 'projects:list',
  projectsTouch: 'projects:touch',
  projectsToggleFavorite: 'projects:toggle-favorite',
  windowToggleFullHeight: 'window:toggle-full-height',
  windowShown: 'window:shown',
  windowOpenSettings: 'window:open-settings',
  windowFullHeight: 'window:full-height',
} as const
