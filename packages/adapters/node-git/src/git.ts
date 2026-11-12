import { execFile } from 'node:child_process'

const TIMEOUT_MS = 3000

// Undefined on any failure: outside a repository, git not installed, timeout
export function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    // No optional lock: the periodic read must not compete for the index with the user's git
    execFile(
      'git',
      ['--no-optional-locks', '-C', cwd, ...args],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => resolve(error ? undefined : stdout),
    )
  })
}
