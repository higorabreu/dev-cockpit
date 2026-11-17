import { spawn } from 'node:child_process'
import type { Logger } from '@dck/core'

// Only how the shell ended: its stderr and the command can carry what the startup files print, secrets too
export type ShellRun =
  | { readonly kind: 'output'; readonly output: string }
  | {
      readonly kind: 'failed'
      readonly code: number | string | null
      readonly signal: NodeJS.Signals | null
      readonly timedOut: boolean
    }

type Run = (file: string, args: readonly string[], timeoutMs: number) => Promise<ShellRun>

export interface LoginPathDeps {
  readonly shell: string
  readonly logger: Logger
  readonly run?: Run
}

const MARK = '__DCK_PATH__'
const TIMEOUT_MS = 2000
const MAX_OUTPUT = 64 * 1024
const ABSOLUTE_ENTRY = /^\/[^\n\r]*$/

// An interactive shell ignores SIGTERM and a `read` in its startup files waits on stdin forever, so the
// shell gets no stdin, its own process group and a SIGKILL to the whole group once it is done or late
export const runLoginShell: Run = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    const child = spawn(file, [...args], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    let settled = false
    const killGroup = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group already exited: nothing is left to stop
      }
    }
    const settle = (result: ShellRun) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      killGroup()
      // On macOS a child forked while the group is being killed can miss the signal; it is still in the
      // group, so killing it again once the shell is gone, and once more a moment later, stops it
      child.once('exit', killGroup)
      setTimeout(killGroup, 100).unref()
      resolve(result)
    }
    const timer = setTimeout(
      () => settle({ kind: 'failed', code: null, signal: 'SIGKILL', timedOut: true }),
      timeoutMs,
    )
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output = (output + chunk).slice(0, MAX_OUTPUT)
      // The closing mark is all we wait for; past the cap the marks are not coming
      if (output.split(MARK).length > 2 || output.length >= MAX_OUTPUT)
        settle({ kind: 'output', output })
    })
    child.on('error', (error: NodeJS.ErrnoException) =>
      settle({ kind: 'failed', code: error.code ?? null, signal: null, timedOut: false }),
    )
    child.on('close', (code, signal) =>
      settle(
        code === 0 ? { kind: 'output', output } : { kind: 'failed', code, signal, timedOut: false },
      ),
    )
  })

// An app opened from Finder or launchd gets a minimal PATH; the login shell has the one Terminal.app sees
export async function readLoginPath(deps: LoginPathDeps): Promise<string | undefined> {
  const { shell, logger, run = runLoginShell } = deps
  // The marks fence the value off from whatever the shell's startup files print
  const result = await run(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], TIMEOUT_MS)
  if (result.kind === 'failed') {
    const { code, signal, timedOut } = result
    logger.warn('login shell PATH not read, keeping the inherited one', {
      shell,
      code,
      signal,
      timedOut,
    })
    return undefined
  }
  const parts = result.output.split(MARK)
  const entries = (parts.length > 2 ? (parts[1] ?? '') : '').split(':')
  // One stray entry (an empty one from a trailing colon, say) should not cost the whole PATH
  const valid = entries.filter((entry) => ABSOLUTE_ENTRY.test(entry))
  const dropped = entries.length - valid.length
  if (valid.length === 0) {
    logger.warn('login shell PATH has no valid entry, keeping the inherited one', {
      shell,
      dropped,
    })
    return undefined
  }
  if (dropped > 0) logger.warn('login shell PATH entries dropped', { shell, dropped })
  return valid.join(':')
}
