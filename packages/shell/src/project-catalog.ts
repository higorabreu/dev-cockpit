import { type ProjectCatalog, rankProjects } from '@dck/core'
import { scanProjects } from './project-scan.ts'
import type { RecencyStore } from './recency-store.ts'

export function createProjectCatalog(root: string, recency: RecencyStore): ProjectCatalog {
  return {
    async list() {
      const [projects, recent] = await Promise.all([scanProjects(root), recency.list()])
      return rankProjects(projects, recent)
    },
    touch: (path) => recency.touch(path),
  }
}
