import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type Logger, parseSemver } from '@dck/core'
import { z } from 'zod'

const fileSchema = z.object({
  dismissed: z
    .string()
    .max(64)
    .refine((text) => parseSemver(text) !== undefined),
})

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

// The version whose update notice the user dismissed, kept across runs; read once, written on change
export async function loadDismissedFile(file: string, logger: Logger) {
  const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') logger.warn('update state unreadable', { file, code: error.code })
    return undefined
  })
  const parsed = raw === undefined ? undefined : fileSchema.safeParse(safeJson(raw))
  if (parsed && !parsed.success) logger.warn('update state invalid, ignored', { file })
  let dismissed = parsed?.success ? parsed.data.dismissed : undefined

  return {
    get: () => dismissed,
    set(version: string) {
      dismissed = version
      void (async () => {
        try {
          await mkdir(dirname(file), { recursive: true })
          // Writes beside it and renames, so a crash never leaves the file half-written
          const temporary = `${file}.tmp`
          await writeFile(temporary, JSON.stringify({ dismissed: version }))
          await rename(temporary, file)
        } catch (error) {
          logger.warn('could not save the dismissed update', { file, error: String(error) })
        }
      })()
    },
  }
}
