import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type Logger, recordInteraction } from '@dck/core'
import { z } from 'zod'

const fileSchema = z.array(z.string())

export interface RecencyStore {
  list(): Promise<readonly string[]>
  touch(path: string): Promise<void>
}

// Arquivo ilegível vira lista vazia: perder a ordem de recência não pode impedir o app de abrir
export function createRecencyStore(file: string, logger: Logger): RecencyStore {
  let recent: readonly string[] | undefined

  async function load(): Promise<readonly string[]> {
    const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT')
        logger.warn('recency file unreadable', { file, code: error.code })
      return undefined
    })
    if (text === undefined) return []
    const parsed = fileSchema.safeParse(safeJson(text))
    if (!parsed.success) logger.warn('recency file invalid, starting empty', { file })
    return parsed.success ? parsed.data : []
  }

  async function list() {
    recent ??= await load()
    return recent
  }

  return {
    list,
    async touch(path) {
      recent = recordInteraction(await list(), path)
      try {
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, JSON.stringify(recent))
      } catch (error) {
        logger.error('could not save recent projects', { file, reason: String(error) })
      }
    },
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
