import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type Logger, MAX_RECENT_FILES, MAX_TAB_NAME, type SavedTabs } from '@dck/core'
import { z } from 'zod'

// A path or a name the window could send, bounded: the file is read back on every start
const text = (max: number) => z.string().min(1).max(max)

export const savedTabsSchema = z.object({
  tabs: z
    .array(
      z.object({
        cwd: text(4096).optional(),
        label: text(256).optional(),
        project: text(4096).optional(),
        name: text(MAX_TAB_NAME).optional(),
        file: text(4096).optional(),
        // A list saved when the limit was larger keeps its newest files
        recent: z
          .array(text(4096))
          .max(50)
          .transform((paths) => paths.slice(0, MAX_RECENT_FILES))
          .optional(),
      }),
    )
    .max(200),
  active: z.number().int().min(0),
})

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

// The tabs of the last run. A missing or invalid file is no tabs: the window opens one as it always did
export function createSavedTabsFile(file: string, logger: Logger) {
  // Saves run one after the other, so two writes never share the temporary file
  let pending = Promise.resolve()

  async function write(tabs: SavedTabs): Promise<void> {
    try {
      await mkdir(dirname(file), { recursive: true })
      // Writes beside it and renames, so a crash never leaves the file half-written
      const temporary = `${file}.tmp`
      await writeFile(temporary, JSON.stringify(tabs))
      await rename(temporary, file)
    } catch (error) {
      logger.error('could not save the tabs', { file, error: String(error) })
    }
  }

  return {
    async load(): Promise<SavedTabs | undefined> {
      const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT')
          logger.warn('saved tabs unreadable', { file, code: error.code })
        return undefined
      })
      if (raw === undefined) return undefined
      const parsed = savedTabsSchema.safeParse(safeJson(raw))
      if (!parsed.success) logger.warn('saved tabs invalid, opening one tab', { file })
      return parsed.success ? parsed.data : undefined
    },
    save(tabs: SavedTabs): Promise<void> {
      pending = pending.then(() => write(tabs))
      return pending
    },
    // Settles once every save asked so far is on disk, so a restart does not cut the last one
    written: () => pending,
  }
}

export type SavedTabsFile = ReturnType<typeof createSavedTabsFile>
