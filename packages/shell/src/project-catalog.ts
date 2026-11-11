import { type ProjectCatalog, rankProjects } from '@dck/core'
import type { FavoritesStore } from './favorites-store.ts'
import { scanProjects } from './project-scan.ts'
import type { RecencyStore } from './recency-store.ts'

export interface ProjectScanConfig {
  readonly root: string
  readonly depth: number
}

// A pasta e a profundidade são lidas a cada listagem: mudam nas configurações sem reiniciar
export function createProjectCatalog(
  config: ProjectScanConfig | (() => ProjectScanConfig),
  recency: RecencyStore,
  favorites: FavoritesStore,
): ProjectCatalog {
  const current = () => (typeof config === 'function' ? config() : config)
  return {
    async list() {
      const { root, depth } = current()
      const [projects, recent, pinned] = await Promise.all([
        scanProjects(root, depth),
        recency.list(),
        favorites.list(),
      ])
      return rankProjects(projects, recent, pinned)
    },
    touch: (path) => recency.touch(path),
    toggleFavorite: (path) => favorites.toggle(path),
  }
}
