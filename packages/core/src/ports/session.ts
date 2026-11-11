export interface GitStatus {
  readonly root: string
  // Indefinido com a HEAD solta
  readonly branch: string | undefined
  readonly changed: number
  readonly ahead: number
  readonly behind: number
}

export interface GitInspector {
  // Indefinido quando o diretório não está em um repositório
  status(cwd: string): Promise<GitStatus | undefined>
}

export interface ProcessInfo {
  readonly cwd: string
  // Nome do processo em primeiro plano no terminal da sessão
  readonly foreground: string
}

export interface ProcessInspector {
  inspect(pid: number): Promise<ProcessInfo | undefined>
}

export type SessionActivity = 'idle' | 'claude' | 'busy'

export interface SessionSnapshot {
  readonly cwd: string
  readonly process: string
  readonly activity: SessionActivity
  readonly git?: GitStatus
}
