import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  type ExtensionCandidate,
  type ExtensionFinder,
  type ImplicitSource,
  implicitManifest,
  type Logger,
  silentLogger,
} from '@dck/core'

export const MANIFEST_FILE = 'dck-extension.json'

export interface FolderEntry {
  readonly name: string
  readonly isDirectory: boolean
}

export interface ExtensionFiles {
  // Undefined when the folder does not exist or cannot be listed
  readDir(path: string): Promise<readonly FolderEntry[] | undefined>
  // Undefined when the file cannot be read
  readFile(path: string): Promise<string | undefined>
}

export interface FileExtensionFinderOptions {
  // The user's extensions folder: each direct subfolder with a manifest is an installed extension
  readonly installedDir: string
  // The user's own files in the app's config directory
  readonly globalDir: string
  // The `.dck` folder of the current repository, already resolved by the caller
  readonly repositoryDir?: string
  readonly implicit: {
    readonly apiVersion: number
    readonly appVersion: string
    // Contribution point id to the name of the folder that holds it in a global or repository folder
    readonly points: Readonly<Record<string, string>>
  }
  readonly fs?: ExtensionFiles
  readonly logger?: Logger
}

const isDirectory = (path: string) =>
  stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  )

export const nodeFiles: ExtensionFiles = {
  async readDir(path) {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => undefined)
    if (entries === undefined) return undefined
    return Promise.all(
      entries.map(async (entry) => ({
        name: entry.name,
        // A linked folder (an extension under development) counts as a folder
        isDirectory:
          entry.isDirectory() ||
          (entry.isSymbolicLink() && (await isDirectory(join(path, entry.name)))),
      })),
    )
  },
  readFile: (path) => readFile(path, 'utf8').catch(() => undefined),
}

// Code unit order, so the result does not depend on the locale or on the file system
export const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const MAX_LEVELS = 32

// The folder that holds `.git` (a folder, or a file in a linked worktree), walking up from the directory
export async function findRepositoryRoot(
  cwd: string,
  files: ExtensionFiles = nodeFiles,
): Promise<string | undefined> {
  let directory = cwd
  for (let level = 0; level < MAX_LEVELS; level++) {
    const entries = (await files.readDir(directory)) ?? []
    if (entries.some((entry) => entry.name === '.git')) return directory
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
  return undefined
}

const MAX_LEVELS = 32

// The folder that holds `.git` (a folder, or a file in a linked worktree), walking up from the directory
export async function findRepositoryRoot(
  cwd: string,
  files: ExtensionFiles = nodeFiles,
): Promise<string | undefined> {
  let directory = cwd
  for (let level = 0; level < MAX_LEVELS; level++) {
    const entries = (await files.readDir(directory)) ?? []
    if (entries.some((entry) => entry.name === '.git')) return directory
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
  return undefined
}

export function createFileExtensionFinder(options: FileExtensionFinderOptions): ExtensionFinder {
  const files = options.fs ?? nodeFiles
  const logger = options.logger ?? silentLogger

  async function readManifest(file: string): Promise<unknown> {
    const text = await files.readFile(file)
    if (text === undefined) {
      logger.warn('extension manifest unreadable', { file })
      return undefined
    }
    try {
      // Editors on Windows save a byte order mark that JSON.parse refuses
      return JSON.parse(text.replace(/^\uFEFF/, ''))
    } catch (error) {
      logger.warn('extension manifest is not valid json', { file, error: String(error) })
      return undefined
    }
  }

  async function installed(): Promise<ExtensionCandidate[]> {
    const entries = (await files.readDir(options.installedDir)) ?? []
    const folders = entries
      .filter((entry) => entry.isDirectory)
      .map((entry) => entry.name)
      .sort(byName)
    const candidates: ExtensionCandidate[] = []
    for (const name of folders) {
      const location = join(options.installedDir, name)
      const content = (await files.readDir(location)) ?? []
      if (!content.some((entry) => entry.name === MANIFEST_FILE)) continue
      const manifest = await readManifest(join(location, MANIFEST_FILE))
      candidates.push({ source: 'installed', location, manifest })
    }
    return candidates
  }

  async function implicit(
    source: ImplicitSource,
    location: string | undefined,
  ): Promise<ExtensionCandidate[]> {
    const entries = location === undefined ? undefined : await files.readDir(location)
    if (location === undefined || entries === undefined) return []
    const folders = new Set(entries.filter((entry) => entry.isDirectory).map((entry) => entry.name))
    const contributes = Object.fromEntries(
      Object.entries(options.implicit.points)
        .filter(([, folder]) => folders.has(folder))
        .sort(([a], [b]) => byName(a, b)),
    )
    // A folder that holds nothing this version knows is not listed as an empty extension
    if (Object.keys(contributes).length === 0) return []
    const { apiVersion, appVersion } = options.implicit
    const manifest = implicitManifest({ source, apiVersion, appVersion, contributes })
    return [{ source, location, manifest }]
  }

  return {
    async find() {
      return [
        ...(await installed()),
        ...(await implicit('global', options.globalDir)),
        ...(await implicit('repository', options.repositoryDir)),
      ]
    },
  }
}
