import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { type StandardFiles, splitStandardFile } from '@dck/core'
import { parse } from 'yaml'
import { byName, type ExtensionFiles, nodeFiles } from './extension-finder.ts'

export interface WritableFiles extends ExtensionFiles {
  // Atomic, and creates the folder when it is missing
  writeFile(path: string, text: string): Promise<void>
}

export interface StandardFilesOptions {
  readonly fs?: WritableFiles
}

const nodeWritableFiles: WritableFiles = {
  ...nodeFiles,
  async writeFile(path, text) {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp`
    await writeFile(temporary, text)
    await rename(temporary, path)
  },
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
  const files = options.fs ?? nodeWritableFiles
  return {
    async list(folder) {
      const entries = (await files.readDir(folder)) ?? []
      const names = entries
        .filter((entry) => !entry.isDirectory && entry.name.endsWith('.md'))
        .map((entry) => entry.name)
        .sort(byName)
      return Promise.all(
        names.map(async (name) => {
          const path = join(folder, name)
          // An unreadable file comes back empty, so it is reported instead of silently skipped
          const { yaml, body } = splitStandardFile((await files.readFile(path)) ?? '')
          return { path, frontMatter: parseYaml(yaml), body }
        }),
      )
    },
    readText: (path) => files.readFile(path),
    writeText: (path, text) => files.writeFile(path, text),
  }
}
