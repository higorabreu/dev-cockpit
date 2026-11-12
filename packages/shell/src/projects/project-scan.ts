import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Project } from '@dck/core'

const SUBMODULE_PATH = /^\s*path\s*=\s*(.+?)\s*$/gm

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

async function mtime(path: string): Promise<number | undefined> {
  return stat(path).then(
    (info) => info.mtimeMs,
    () => undefined,
  )
}

// The HEAD reflog changes on every commit or branch switch; without it the marker itself counts
async function activityOf(directory: string): Promise<number | undefined> {
  return (await mtime(join(directory, '.git', 'logs', 'HEAD'))) ?? mtime(join(directory, '.git'))
}

async function toProject(directory: string): Promise<Project> {
  const activity = await activityOf(directory)
  return { name: basename(directory), path: directory, ...(activity ? { activity } : {}) }
}

async function submodulesOf(directory: string): Promise<Project[]> {
  const text = await readFile(join(directory, '.gitmodules'), 'utf8').catch(() => '')
  const paths = [...text.matchAll(SUBMODULE_PATH)].flatMap((match) => match[1] ?? [])
  const found = await Promise.all(
    paths.map(async (relative) => {
      const path = join(directory, relative)
      return (await exists(join(path, '.git'))) ? [await toProject(path)] : []
    }),
  )
  return found.flat()
}

async function scan(directory: string, depth: number): Promise<Project[]> {
  if (await exists(join(directory, '.git'))) {
    return [await toProject(directory), ...(await submodulesOf(directory))]
  }
  if (depth === 0) return []
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const children = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => scan(join(directory, entry.name), depth - 1))
  return (await Promise.all(children)).flat()
}

// A repository is a project, and so is each submodule declared in .gitmodules
export async function scanProjects(root: string, depth = 2): Promise<readonly Project[]> {
  return scan(root, depth)
}
