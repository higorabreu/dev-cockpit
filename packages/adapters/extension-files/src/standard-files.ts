import { randomBytes } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import {
  errorBody,
  fail,
  type Logger,
  ok,
  type StandardFiles,
  silentLogger,
  splitStandardFile,
} from '@dck/core'
import { parse } from 'yaml'
import { byName } from './extension-finder.ts'

export interface StandardFilesOptions {
  readonly logger?: Logger
}

const MAX_BYTES = 256 * 1024
const MAX_FILES = 200
const NOT_REGULAR = 'not a regular file of at most 256 KB'

// A link, a device or a pipe is never read: it could leak another file, hang or never end
async function readRegular(
  path: string,
): Promise<{ text: string } | { problem: string } | undefined> {
  const stats = await lstat(path).catch(() => undefined)
  if (stats === undefined) return undefined
  if (!stats.isFile() || stats.size > MAX_BYTES) return { problem: NOT_REGULAR }
  return readFile(path, 'utf8').then(
    (text) => ({ text }),
    (error: unknown) => ({ problem: String(error) }),
  )
}

// The first link between `root` and the path, which a repository could have planted to send a write elsewhere
async function linkOnTheWay(root: string, path: string): Promise<string | undefined> {
  let current = root
  for (const part of relative(root, path).split(sep)) {
    current = join(current, part)
    const stats = await lstat(current).catch(() => undefined)
    if (stats?.isSymbolicLink()) return current
  }
  return undefined
}

async function writeAtomically(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true })
  // A unique name created exclusively, so a link planted at the temporary name is never followed
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temporary, text, { flag: 'wx' })
  await rename(temporary, path).catch(async (error: unknown) => {
    await rm(temporary, { force: true })
    throw error
  })
}

function parseYaml(yaml: string | undefined): unknown {
  if (yaml === undefined) return undefined
  try {
    return parse(yaml)
  } catch {
    // The core reports a file without a front matter with its path, so nothing is logged here
    return undefined
  }
}

export function createStandardFiles(options: StandardFilesOptions = {}): StandardFiles {
  const logger = options.logger ?? silentLogger
  return {
    async list(folder) {
      const stats = await lstat(folder).catch(() => undefined)
      if (!stats?.isDirectory()) return []
      const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
      const names = entries
        .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.md'))
        .map((entry) => entry.name)
        .sort(byName)
      if (names.length > MAX_FILES) {
        logger.warn('standards folder holds too many files', {
          folder,
          read: MAX_FILES,
          found: names.length,
        })
      }
      return Promise.all(
        names.slice(0, MAX_FILES).map(async (name) => {
          const path = join(folder, name)
          const read = (await readRegular(path)) ?? { problem: 'could not be read' }
          // A refused file is reported with its path instead of silently skipped
          if ('problem' in read)
            return { path, frontMatter: undefined, body: '', problem: read.problem }
          const { yaml, body } = splitStandardFile(read.text)
          return { path, frontMatter: parseYaml(yaml), body }
        }),
      )
    },

    async readText(path) {
      const read = await readRegular(path)
      if (read === undefined) return ok(undefined)
      return 'problem' in read
        ? fail(errorBody('DCK-STD-002', `${path}: ${read.problem}`))
        : ok(read.text)
    },

    async writeText(path, text, root) {
      const link = await linkOnTheWay(root, path)
      if (link !== undefined) {
        return fail(errorBody('DCK-STD-002', `${link}: a symbolic link, not followed`))
      }
      try {
        await writeAtomically(path, text)
        return ok(undefined)
      } catch (error) {
        logger.warn('could not write a standards file', { path, error: String(error) })
        return fail(errorBody('DCK-STD-002', String(error)))
      }
    },
  }
}
