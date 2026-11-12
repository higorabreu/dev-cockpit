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

// Lista de caminhos num arquivo JSON. Arquivo ilegível vira lista vazia: perder uma lista de
// preferências não pode impedir o app de abrir
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
