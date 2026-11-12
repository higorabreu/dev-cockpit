import { type Logger, recordInteraction } from '@dck/core'
import { createPathListFile } from './path-list-file.ts'

export interface RecencyStore {
  list(): Promise<readonly string[]>
  touch(path: string): Promise<void>
}

export function createRecencyStore(file: string, logger: Logger): RecencyStore {
  const storage = createPathListFile(file, logger, 'recent projects')
  let recent: readonly string[] | undefined

  async function list() {
    recent ??= await storage.load()
    return recent
  }

  return {
    list,
    async touch(path) {
      recent = recordInteraction(await list(), path)
      await storage.save(recent)
    },
  }
}
