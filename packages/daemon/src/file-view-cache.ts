import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type Logger, type ViewCache, type ViewCacheData, viewItemSchema } from '@dck/core'
import { z } from 'zod'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// A cache written before connectors held only merge requests and had no `kind`
const cachedItem = z.preprocess(
  (value) => (isRecord(value) && !('kind' in value) ? { ...value, kind: 'mergeRequest' } : value),
  viewItemSchema,
)

const cachedView = z.object({ items: z.array(cachedItem), updatedAt: z.number() })

const dataSchema = z.object({
  scope: z.string(),
  views: z.record(z.string(), cachedView),
})

// An unreadable or otherwise broken file becomes "no cache": the server is the source, the file only speeds things up
export function createFileViewCache(file: string, logger: Logger): ViewCache {
  const write = async (data: ViewCacheData) => {
    try {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 })
      const temporary = `${file}.tmp`
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 })
      await rename(temporary, file)
    } catch (error) {
      logger.error('could not save the views cache', { file, error: String(error) })
    }
  }
  // Views refresh together and share one temporary file, so saves queue up and the last call wins
  let pending: Promise<void> = Promise.resolve()

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

    save(data: ViewCacheData) {
      pending = pending.then(() => write(data))
      return pending
    },
  }
}
