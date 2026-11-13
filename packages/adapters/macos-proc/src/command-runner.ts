import { execFile } from 'node:child_process'

const TIMEOUT_MS = 2000

// Undefined when the command fails with no output; `lsof` exits 1 when one of several pids is gone
// but still prints the others
export type CommandRunner = (
  command: 'ps' | 'lsof',
  args: readonly string[],
) => Promise<string | undefined>

export const runCommand: CommandRunner = (command, args) =>
  new Promise((resolve) => {
    execFile(command, [...args], { timeout: TIMEOUT_MS }, (error, stdout) =>
      resolve(error && !stdout ? undefined : stdout),
    )
  })
