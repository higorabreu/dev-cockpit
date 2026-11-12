import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Logger } from '@dck/core'
import { z } from 'zod'

const listSchema = z.array(z.string())

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// List of paths in a JSON file. An unreadable file becomes an empty list: losing a list of
// preferences must not stop the app from opening
export function createPathListFile(file: string, logger: Logger, label: string) {
  return {
    async load(): Promise<readonly string[]> {
      const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT')
          logger.warn(`${label} file unreadable`, { file, code: error.code })
        return undefined
      })
      if (text === undefined) return []
      const parsed = listSchema.safeParse(safeJson(text))
      if (!parsed.success) logger.warn(`${label} file invalid, starting empty`, { file })
      return parsed.success ? parsed.data : []
    },
    async save(paths: readonly string[]): Promise<void> {
      try {
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, JSON.stringify(paths))
      } catch (error) {
        logger.error(`could not save ${label}`, { file, error: String(error) })
      }
    },
  }
}
