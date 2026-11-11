import type { PtyHost, PtyOptions, PtySession } from '@dck/core'
import { spawn } from 'node-pty'

const TERM = 'xterm-256color'

function environment(options: PtyOptions): Record<string, string> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  return { ...inherited, COLORTERM: 'truecolor', ...options.env }
}

export function createNodePtyHost(): PtyHost {
  return {
    spawn(options: PtyOptions): PtySession {
      const terminal = spawn(options.file, [...options.args], {
        name: TERM,
        cols: options.cols,
        rows: options.rows,
        ...(options.cwd ? { cwd: options.cwd } : {}),
        env: environment(options),
      })
      return {
        pid: terminal.pid,
        write: (data) => terminal.write(data),
        resize: (cols, rows) => terminal.resize(cols, rows),
        kill: () => terminal.kill(),
        onData(listener) {
          const subscription = terminal.onData(listener)
          return () => subscription.dispose()
        },
        onExit(listener) {
          const subscription = terminal.onExit(({ exitCode, signal }) =>
            listener({ code: exitCode, signal: signal ?? null }),
          )
          return () => subscription.dispose()
        },
      }
    },
  }
}
