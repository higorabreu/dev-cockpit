import { spawn } from 'node:child_process'
import type { GitFiles, GitOthers, GitTracked } from '@dck/core'
import { type GitRun, runGit, systemPath } from './git-run.ts'

export interface GitListOptions {
  readonly timeoutMs: number
  // Names read before git is stopped; the list is then marked truncated
  readonly maxEntries: number
}

export interface GitListAnswer {
  readonly entries: readonly string[]
  readonly truncated: boolean
}

// Runs a git command whose output is NUL separated names; undefined when git fails or runs out of time
export type GitList = (
  cwd: string,
  args: readonly string[],
  options: GitListOptions,
) => Promise<GitListAnswer | undefined>

// Reads names as they come and stops git at the cap, so a huge tree never fills memory
export const listGit: GitList = (cwd, args, options) =>
  new Promise((resolve) => {
    const child = spawn('git', ['--no-optional-locks', '-C', cwd, ...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
    })
    const entries: string[] = []
    let rest = ''
    let truncated = false
    let done = false
    const finish = (answer: GitListAnswer | undefined) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill()
      resolve(answer)
    }
    const timer = setTimeout(() => finish(undefined), options.timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      const names = (rest + chunk).split('\0')
      rest = names.pop() ?? ''
      for (const name of names) {
        if (entries.length >= options.maxEntries) {
          truncated = true
          return finish({ entries, truncated })
        }
        entries.push(name)
      }
    })
    child.on('error', () => finish(undefined))
    child.on('close', (code) => finish(code === 0 ? { entries, truncated } : undefined))
  })

// More files than any editor's quick open lists; past it the first ones are kept
const MAX_FILES = 200_000
// Ignored names come one by one only for shallow files, wholly ignored folders closed
const MAX_IGNORED = 20_000
const TIMEOUT_MS = 5000
const IGNORED_TIMEOUT_MS = 3000

// Submodules' files need --recurse-submodules, which git takes only with --cached alone
const TRACKED = ['ls-files', '--cached', '--recurse-submodules', '-z'] as const
// A nested repository shows as a folder here; its files are not this repository's
const UNTRACKED = ['ls-files', '--others', '--exclude-standard', '-z'] as const
const IGNORED = [
  'ls-files',
  '--others',
  '--ignored',
  '--exclude-standard',
  '--directory',
  '--no-empty-directory',
  '-z',
] as const

export interface GitFilesOptions {
  readonly run?: GitRun
  readonly list?: GitList
}

// The files of the repository holding a folder, from its top: git applies every ignore rule itself
export function createGitFiles(options: GitFilesOptions = {}): GitFiles {
  const run = options.run ?? runGit
  const list = options.list ?? listGit
  return {
    async tracked(cwd): Promise<GitTracked | undefined> {
      const top = await run(cwd, ['rev-parse', '--show-toplevel'], {
        timeoutMs: TIMEOUT_MS,
        maxBytes: 64 * 1024,
      })
      const root = top.ok ? systemPath(top.stdout) : ''
      if (root === '') return undefined
      const tracked = await list(root, TRACKED, { timeoutMs: TIMEOUT_MS, maxEntries: MAX_FILES })
      return tracked && { root, files: tracked.entries, truncated: tracked.truncated }
    },
    async others(root): Promise<GitOthers> {
      const [untracked, ignored] = await Promise.all([
        list(root, UNTRACKED, { timeoutMs: TIMEOUT_MS, maxEntries: MAX_FILES }),
        list(root, IGNORED, { timeoutMs: IGNORED_TIMEOUT_MS, maxEntries: MAX_IGNORED }),
      ])
      // A scan that failed or ran out of time leaves its part empty: the search still has the tracked files
      return {
        files: (untracked?.entries ?? []).filter((name) => !name.endsWith('/')),
        ignored: ignored?.entries ?? [],
        truncated: untracked?.truncated === true,
      }
    },
  }
}
