import { posix, win32 } from 'node:path'
import type { Logger } from '@dck/core'

export interface TabPathDeps {
  readonly platform: NodeJS.Platform
  // The PATH this process has, which every tab inherits
  inherited(): string | undefined
  // The PATH the tabs' own shell ends up with after its startup files, or undefined when it could not be read
  read(): Promise<string | undefined>
  readonly logger: Logger
  now(): number
}

// Each folder once, in the order first seen
export function mergePaths(delimiter: string, ...paths: readonly (string | undefined)[]): string {
  const folders = paths.flatMap((path) => (path ?? '').split(delimiter)).filter((f) => f !== '')
  return [...new Set(folders)].join(delimiter)
}

// The PATH a command typed in a tab is looked up in: this process's PATH plus what the tabs' shell adds in
// its startup files (nvm, `~/.local/bin` in `.bashrc`), which an app opened from a desktop menu never ran.
// The shell runs once, the first time it is needed, and its answer is kept for the app's life
export function createTabPath(deps: TabPathDeps) {
  let resolved: Promise<string | undefined> | undefined

  async function resolve(): Promise<string | undefined> {
    const started = deps.now()
    const shell = await deps.read()
    const inherited = mergePaths(posix.delimiter, deps.inherited())
    const merged = mergePaths(posix.delimiter, inherited, shell)
    const count = (path: string) => (path === '' ? 0 : path.split(posix.delimiter).length)
    // How long it took and how many folders the shell added, never the folders themselves
    deps.logger.info('tab shell PATH read', {
      ms: Math.round(deps.now() - started),
      read: shell !== undefined,
      added: count(merged) - count(inherited),
    })
    return merged === '' ? undefined : merged
  }

  return {
    path(): Promise<string | undefined> {
      // Windows starts no POSIX shell to ask; its tabs get this process's PATH as it is
      if (deps.platform === 'win32')
        return Promise.resolve(mergePaths(win32.delimiter, deps.inherited()) || undefined)
      resolved ??= resolve()
      return resolved
    },
  }
}
