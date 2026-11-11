// Letra do estado de um arquivo, como no Source Control: M alterado, A novo no índice, D removido,
// R renomeado, U não rastreado, ! em conflito
export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | 'U' | '!'

export interface GitFile {
  readonly status: GitFileStatus
  readonly path: string
}

export interface GitCommit {
  readonly hash: string
  readonly subject: string
  // Segundos desde 1970, como o git entrega
  readonly time: number
}

export interface GitSubmodule {
  readonly path: string
  readonly changed: number
  readonly ahead: number
  readonly behind: number
}

export interface GitStatus {
  readonly root: string
  // Indefinido com a HEAD solta
  readonly branch: string | undefined
  readonly upstream: string | undefined
  // Arquivos distintos, sem contar submódulos
  readonly changed: number
  readonly staged: readonly GitFile[]
  readonly changes: readonly GitFile[]
  readonly ahead: number
  readonly behind: number
  // Commits ainda não enviados e commits do remoto ainda não trazidos, os mais recentes primeiro
  readonly outgoing: readonly GitCommit[]
  readonly incoming: readonly GitCommit[]
  // Só os submódulos com pendência
  readonly submodules: readonly GitSubmodule[]
  readonly submodulesClean: number
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

export interface SessionActivityInfo {
  readonly cwd: string
  readonly process: string
  readonly activity: SessionActivity
}

export interface SessionSnapshot extends SessionActivityInfo {
  readonly git?: GitStatus
}
