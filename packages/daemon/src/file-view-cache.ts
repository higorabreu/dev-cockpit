import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  type Logger,
  mergeRequestSummarySchema,
  type ViewCache,
  type ViewCacheData,
} from '@dck/core'
import { z } from 'zod'

const cachedView = z.object({ items: z.array(mergeRequestSummarySchema), updatedAt: z.number() })

const dataSchema = z.object({
  scope: z.string(),
  views: z.object({ review: cachedView.optional(), mine: cachedView.optional() }),
})

// An unreadable or otherwise broken file becomes "no cache": the server is the source, the file only speeds things up
export function createFileViewCache(file: string, logger: Logger): ViewCache {
  return {
    async load() {
      const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT')
          logger.warn('views cache unreadable', { file, code: error.code })
        return undefined
      })
      if (text === undefined) return undefined
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        logger.warn('views cache is not valid json, ignoring it', { file })
        return undefined
      }
      const parsed = dataSchema.safeParse(raw)
      if (!parsed.success)
        logger.warn('views cache has an unexpected format, ignoring it', { file })
      return parsed.success ? parsed.data : undefined
    },

    async save(data: ViewCacheData) {
      try {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 })
        const temporary = `${file}.tmp`
        await writeFile(temporary, JSON.stringify(data), { mode: 0o600 })
        await rename(temporary, file)
      } catch (error) {
        logger.error('could not save the views cache', { file, error: String(error) })
      }
    },
  }
}
