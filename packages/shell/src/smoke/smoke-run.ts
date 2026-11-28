import type { Logger, ProcessInspector, PtyHost, PtySession, SecretStore } from '@dck/core'

export const SMOKE_FLAG = '--smoke'
const MARKER = 'dck-smoke-ok'
const TIMEOUT_MS = 20_000

export interface SmokeDeps {
  readonly platform: NodeJS.Platform
  readonly ptyHost: PtyHost
  readonly secrets: SecretStore
  readonly processes: ProcessInspector
  readonly home: string
  // Gives the inspector the terminal's folder where it cannot read it from the process
  readonly started?: (pid: number, cwd: string) => void
  readonly logger: Logger
  readonly timeoutMs?: number
}

// The system's own shell, which stays open after the echo so the inspector still finds it
const echo = (platform: NodeJS.Platform) =>
  platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/k', `echo ${MARKER}`] }
    : { file: '/bin/sh', args: ['-c', `echo ${MARKER}; exec sleep 60`] }

function terminalPrints(session: PtySession, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    let output = ''
    const timer = setTimeout(() => resolve(false), timeoutMs)
    session.onData((data) => {
      output += data
      if (!output.includes(MARKER)) return
      clearTimeout(timer)
      resolve(true)
    })
  })
}

// What a packaged app must load to work: node-pty, the process inspector's binding and the secret store's.
// The release runs it on the built package (`--smoke`) and fails on a false
export async function runSmoke(deps: SmokeDeps): Promise<boolean> {
  const session = deps.ptyHost.spawn({ ...echo(deps.platform), cwd: deps.home, cols: 80, rows: 24 })
  deps.started?.(session.pid, deps.home)
  const terminal = await terminalPrints(session, deps.timeoutMs ?? TIMEOUT_MS)
  const processes = terminal && (await deps.processes.inspect(session.pid)) !== undefined
  session.kill()
  const secret = await deps.secrets.get('smoke-check')
  const checks = { terminal, processes, secrets: secret.ok }
  const passed = terminal && processes && secret.ok
  if (passed) deps.logger.info('smoke check passed', checks)
  else
    deps.logger.error('smoke check failed', {
      ...checks,
      ...(secret.ok ? {} : { secretError: secret.error.message }),
    })
  return passed
}
