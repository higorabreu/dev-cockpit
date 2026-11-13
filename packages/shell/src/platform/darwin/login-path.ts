import { spawn } from 'node:child_process'
import type { Logger } from '@dck/core'

type Run = (file: string, args: readonly string[], timeoutMs: number) => Promise<string>

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
  new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    let settled = false
    const settle = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group already exited: nothing is left to stop
      }
      if (error) reject(error)
      else resolve(output)
    }
    const timer = setTimeout(() => settle(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output = (output + chunk).slice(0, MAX_OUTPUT)
      // The closing mark is all we wait for; past the cap the marks are not coming
      if (output.split(MARK).length > 2 || output.length >= MAX_OUTPUT) settle()
    })
    child.on('error', (error) => settle(error))
    child.on('close', (code, signal) =>
      settle(code === 0 ? undefined : new Error(`exited with ${signal ?? code}`)),
    )
  })

// An app opened from Finder or launchd gets a minimal PATH; the login shell has the one Terminal.app sees
export async function readLoginPath(deps: LoginPathDeps): Promise<string | undefined> {
  const { shell, logger, run = runLoginShell } = deps
  // The marks fence the value off from whatever the shell's startup files print
  const output = await run(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], TIMEOUT_MS).catch(
    (error: unknown) => {
      logger.warn('login shell PATH not read, keeping the inherited one', {
        shell,
        error: String(error),
      })
      return undefined
    },
  )
  if (output === undefined) return undefined
  const path = output.split(MARK)[1] ?? ''
  if (path.split(':').every((entry) => ABSOLUTE_ENTRY.test(entry))) return path
  logger.warn('login shell PATH is not valid, keeping the inherited one', { shell })
  return undefined
}
