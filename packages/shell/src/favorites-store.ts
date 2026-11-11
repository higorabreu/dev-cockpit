import type { Logger } from '@dck/core'
import { createPathListFile } from './path-list-file.ts'

export interface FavoritesStore {
  list(): Promise<readonly string[]>
  // Fixa ou solta e devolve o novo estado
  toggle(path: string): Promise<boolean>
}

export function createFavoritesStore(file: string, logger: Logger): FavoritesStore {
  const storage = createPathListFile(file, logger, 'favorite projects')
  let favorites: readonly string[] | undefined

  async function list() {
    favorites ??= await storage.load()
    return favorites
  }

  return {
    list,
    async toggle(path) {
      const current = await list()
      const pinned = !current.includes(path)
      favorites = pinned ? [path, ...current] : current.filter((entry) => entry !== path)
      await storage.save(favorites)
      return pinned
    },
  }
}
