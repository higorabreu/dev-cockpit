import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Logger, ViewCache, ViewCacheData } from '@dck/core'
import { z } from 'zod'

const summary = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  project: z.string(),
  author: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  draft: z.boolean(),
  updatedAt: z.string(),
  hasConflicts: z.boolean(),
  openDiscussions: z.boolean(),
  pipeline: z.enum(['success', 'failed', 'running', 'pending', 'canceled', 'none', 'unknown']),
})

const cachedView = z.object({ items: z.array(summary), updatedAt: z.number() })

const dataSchema = z.object({
  scope: z.string(),
  views: z.object({ review: cachedView.optional(), mine: cachedView.optional() }),
})

// Arquivo ilegível ou de outra forma vira "sem cache": o servidor é a fonte, o arquivo só acelera
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
