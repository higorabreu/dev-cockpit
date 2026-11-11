export type Unsubscribe = () => void

export interface PtyOptions {
  readonly file: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly cols: number
  readonly rows: number
  readonly env?: Readonly<Record<string, string>>
}

export interface PtyExit {
  readonly code: number | null
  readonly signal: number | null
}

export interface PtySession {
  readonly pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(listener: (data: string) => void): Unsubscribe
  onExit(listener: (exit: PtyExit) => void): Unsubscribe
}

export interface PtyHost {
  spawn(options: PtyOptions): PtySession
}
