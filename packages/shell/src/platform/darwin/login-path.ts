import type { Logger } from '@dck/core'

export interface LoginPathDeps {
  readonly shell: string
  readonly inherited: string | undefined
  run(file: string, args: readonly string[], timeoutMs: number): Promise<string>
  readonly logger: Logger
}

const MARK = '__DCK_PATH__'
const TIMEOUT_MS = 2000
const ABSOLUTE_ENTRY = /^\/[^\n\r]*$/

// An app opened from Finder or launchd gets a minimal PATH; the login shell has the one Terminal.app sees
export async function readLoginPath(deps: LoginPathDeps): Promise<string | undefined> {
  const { shell, inherited, logger } = deps
  // The marks fence the value off from whatever the shell's startup files print
  const output = await deps
    .run(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], TIMEOUT_MS)
    .catch((error: unknown) => {
      logger.warn('login shell PATH not read, keeping the inherited one', {
        shell,
        error: String(error),
      })
      return undefined
    })
  if (output === undefined) return inherited
  const path = output.split(MARK)[1] ?? ''
  if (path.split(':').every((entry) => ABSOLUTE_ENTRY.test(entry))) return path
  logger.warn('login shell PATH is not valid, keeping the inherited one', { shell })
  return inherited
}
