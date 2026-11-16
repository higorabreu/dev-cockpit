import { execFile } from 'node:child_process'

export interface GitRunOptions {
  readonly timeoutMs: number
  readonly maxBytes: number
  // Written to stdin, for commands that read a list from it
  readonly input?: string
}

// Why a git command gave no usable output; `exit` carries Git's own exit code
export type GitFailure =
  | { readonly kind: 'missing' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'exit'; readonly code: number; readonly stderr: string }

export type GitAnswer =
  | { readonly ok: true; readonly stdout: string; readonly code: number }
  | { readonly ok: false; readonly failure: GitFailure }

// Runs git with fixed arguments and no shell; `cwd` is an absolute folder checked by the caller
export type GitRun = (
  cwd: string,
  args: readonly string[],
  options: GitRunOptions,
) => Promise<GitAnswer>

interface ExecError {
  readonly code?: number | string | null
  readonly killed?: boolean
}

function failureOf(error: ExecError, stderr: string): GitFailure {
  if (error.code === 'ENOENT') return { kind: 'missing' }
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return { kind: 'too-large' }
  if (error.killed) return { kind: 'timeout' }
  return { kind: 'exit', code: typeof error.code === 'number' ? error.code : -1, stderr }
}

// Quoted names stay readable UTF-8, no pager, no optional lock: the user's own git keeps the index
export const runGit: GitRun = (cwd, args, options) =>
  new Promise((resolve) => {
    const child = execFile(
      'git',
      ['--no-optional-locks', '-c', 'core.quotePath=false', '-C', cwd, ...args],
      {
        timeout: options.timeoutMs,
        maxBuffer: options.maxBytes,
        encoding: 'utf8',
        env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      },
      (error, stdout, stderr) => {
        if (error === null) resolve({ ok: true, stdout, code: 0 })
        // `diff --no-index` exits with 1 when the files differ, which is the answer itself
        else if (error.code === 1 && args.includes('--no-index'))
          resolve({ ok: true, stdout, code: 1 })
        else resolve({ ok: false, failure: failureOf(error, stderr) })
      },
    )
    // A command that exits before reading stdin closes the pipe; its own answer above says what happened
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(options.input ?? '')
  })

// Runs the task over the items at most `size` at a time, the results in the items' order
export async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.all(items.slice(index, index + size).map(task))))
  }
  return results
}
