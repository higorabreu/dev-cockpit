import { execFile } from 'node:child_process'

const TIMEOUT_MS = 2000
// The default 1 MB would cut a long process table short
const MAX_BUFFER = 8 * 1024 * 1024

// Undefined unless the command finished; `lsof` exits 1 when one of several pids is gone
// but still prints the others
export type CommandRunner = (
  command: 'ps' | 'lsof',
  args: readonly string[],
) => Promise<string | undefined>

export const runCommand: CommandRunner = (command, args) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { timeout: TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER },
      (error, stdout) => {
        const complete = !error || (command === 'lsof' && error.code === 1 && !error.killed)
        resolve(complete ? stdout : undefined)
      },
    )
  })
