import type { Logger } from '@dck/core'

export interface SpawnOptions {
  readonly detached: boolean
  readonly stdio: readonly ['ignore', number | 'ignore', number | 'ignore']
  readonly env: Readonly<Record<string, string | undefined>>
}

export interface LauncherDeps {
  spawn(command: string, args: readonly string[], options: SpawnOptions): { unref(): void }
  readonly execPath: string
  readonly script: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly logFd: number | 'ignore'
}

// The daemon outlives the window: it starts separately, in the background, using Electron itself as Node
export function launchDaemon(deps: LauncherDeps, logger: Logger) {
  const child = deps.spawn(deps.execPath, [deps.script], {
    detached: true,
    stdio: ['ignore', deps.logFd, deps.logFd],
    env: { ...deps.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  child.unref()
  logger.info('daemon launched', { script: deps.script })
}
