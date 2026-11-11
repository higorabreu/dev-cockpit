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
  readonly session: {
    // Leve, sem git: serve para vigiar todas as abas
    activity(ptyId: number): Promise<SessionActivityInfo | undefined>
    inspect(ptyId: number): Promise<SessionSnapshot | undefined>
  }
  readonly projects: {
    list(): Promise<readonly Project[]>
    touch(path: string): void
  }
  readonly window: {
    toggleFullHeight(): void
    onShown(listener: () => void): Unsubscribe
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
  sessionActivity: 'session:activity',
  sessionInspect: 'session:inspect',
  projectsList: 'projects:list',
  projectsTouch: 'projects:touch',
  windowToggleFullHeight: 'window:toggle-full-height',
  windowShown: 'window:shown',
  windowFullHeight: 'window:full-height',
} as const
