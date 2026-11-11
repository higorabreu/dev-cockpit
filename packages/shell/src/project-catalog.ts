import { type ProjectCatalog, rankProjects } from '@dck/core'
import type { FavoritesStore } from './favorites-store.ts'
import { scanProjects } from './project-scan.ts'
import type { RecencyStore } from './recency-store.ts'

export function createProjectCatalog(
  root: string,
  recency: RecencyStore,
  favorites: FavoritesStore,
): ProjectCatalog {
  return {
    async list() {
      const [projects, recent, pinned] = await Promise.all([
        scanProjects(root),
        recency.list(),
        favorites.list(),
      ])
      return rankProjects(projects, recent, pinned)
    },
    touch: (path) => recency.touch(path),
    toggleFavorite: (path) => favorites.toggle(path),
  }
}
