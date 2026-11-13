import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import type { Logger, PathKind, ResolvedPath } from '@dck/core'

export interface FileStats {
  readonly mode: number
  isFile(): boolean
  isDirectory(): boolean
}

// The real disk and desktop behind a path printed in a terminal; the window's word about a path is never trusted
export interface TerminalFiles {
  // Follows links, like `fs.promises.stat`; rejects when the path does not exist
  stat(path: string): Promise<FileStats>
  realpath(path: string): Promise<string>
  // Resolves with an error message, empty on success, like Electron's `shell.openPath`
  openPath(path: string): Promise<string>
  showItemInFolder(path: string): void
}

// Opening one of these with the default app can run it; `.app` and `.command` are bundles and scripts on macOS
const RUNNABLE_EXTENSIONS = new Set([
  '.desktop',
  '.sh',
  '.appimage',
  '.run',
  '.bin',
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.jar',
  '.deb',
  '.rpm',
  '.msi',
  '.com',
  '.vbs',
  '.lnk',
  '.command',
  '.app',
])

const EXECUTE_BITS = 0o111

export function hasRunnableName(path: string): boolean {
  return RUNNABLE_EXTENSIONS.has(extname(basename(path)).toLowerCase())
}

export interface TerminalPathsOptions {
  readonly files: TerminalFiles
  readonly home: string
  readonly logger: Logger
}

// Resolves and opens paths the user Ctrl+clicked in a terminal, never running what it opens
export function createTerminalPaths({ files, home, logger }: TerminalPathsOptions) {
  const statOf = (path: string) => files.stat(path).catch(() => undefined)

  const kindOf = (stats: FileStats | undefined): PathKind => {
    if (stats?.isDirectory()) return 'dir'
    return stats?.isFile() ? 'file' : 'missing'
  }

  function absolute(text: string, base: string | undefined): string | undefined {
    const tilde = /^~(?=$|[\\/])/
    if (tilde.test(text)) return join(home, text.replace(tilde, ''))
    if (isAbsolute(text)) return resolve(text)
    return base === undefined ? undefined : resolve(base, text)
  }

  async function resolveOne(text: string, base: string | undefined): Promise<ResolvedPath> {
    const path = absolute(text, base)
    if (path === undefined) return { path: text, kind: 'missing' }
    return { path, kind: kindOf(await statOf(path)) }
  }

  // Both names count: a harmless looking link may point at a launcher
  async function runnable(path: string, stats: FileStats): Promise<boolean> {
    if (stats.isFile() && (stats.mode & EXECUTE_BITS) !== 0) return true
    const real = await files.realpath(path).catch(() => path)
    return hasRunnableName(path) || hasRunnableName(real)
  }

  async function open(path: string, expected: Exclude<PathKind, 'missing'>) {
    const stats = await statOf(path)
    const kind = kindOf(stats)
    if (!stats || kind !== expected) {
      logger.warn('terminal path refused', { expected, kind })
      return
    }
    if (await runnable(path, stats)) {
      logger.info('terminal path shown in its folder', { kind })
      files.showItemInFolder(path)
      return
    }
    const error = await files.openPath(path)
    // The message from the system may repeat the path, so only the kind is logged
    if (error) logger.warn('terminal path did not open', { kind })
  }

  return {
    resolve: (base: string | undefined, paths: readonly string[]) =>
      Promise.all(paths.map((text) => resolveOne(text, base))),
    openFile: (path: string) => open(path, 'file'),
    openFolder: (path: string) => open(path, 'dir'),
  }
}
