import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Project, ProjectCatalog } from '@dck/core'

const MAX_DEPTH = 2

async function isRepository(directory: string): Promise<boolean> {
  return stat(join(directory, '.git')).then(
    () => true,
    () => false,
  )
}

async function scan(directory: string, depth: number): Promise<Project[]> {
  if (await isRepository(directory)) return [{ name: basename(directory), path: directory }]
  if (depth === 0) return []
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const children = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => scan(join(directory, entry.name), depth - 1))
  return (await Promise.all(children)).flat()
}

// Um repositório é um projeto; não desce dentro dele, os submódulos entram na varredura do M1-T7
export function createProjectScanner(root: string): ProjectCatalog {
  return {
    async list() {
      const found = await scan(root, MAX_DEPTH)
      return found.sort((a, b) => a.name.localeCompare(b.name))
    },
  }
}
