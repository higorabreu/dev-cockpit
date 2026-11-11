import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectCatalog } from './project-catalog.ts'

function memoryFavorites(initial: string[] = []) {
  let pinned = initial
  return {
    list: async () => pinned,
    toggle: async (path: string) => {
      const on = !pinned.includes(path)
      pinned = on ? [path, ...pinned] : pinned.filter((entry) => entry !== path)
      return on
    },
  }
}

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-catalog-'))
  for (const name of ['alpha', 'beta']) await mkdir(join(root, name, '.git'), { recursive: true })
})

afterEach(() => rm(root, { recursive: true, force: true }))

function memoryRecency(initial: string[] = []) {
  let recent = initial
  return {
    list: async () => recent,
    touch: async (path: string) => {
      recent = [path, ...recent.filter((entry) => entry !== path)]
    },
  }
}

describe('createProjectCatalog', () => {
  it('should list the recently opened project first when listing', async () => {
    const catalog = createProjectCatalog(
      root,
      memoryRecency([join(root, 'beta')]),
      memoryFavorites(),
    )

    const projects = await catalog.list()

    expect(projects.map((project) => project.name)).toEqual(['beta', 'alpha'])
  })

  it('should move a project to the top when it is touched', async () => {
    const catalog = createProjectCatalog(root, memoryRecency(), memoryFavorites())

    await catalog.touch(join(root, 'beta'))
    const projects = await catalog.list()

    expect(projects[0]?.name).toBe('beta')
  })

  it('should list a pinned project first and mark it when it is pinned', async () => {
    const catalog = createProjectCatalog(
      root,
      memoryRecency([join(root, 'beta')]),
      memoryFavorites([join(root, 'alpha')]),
    )

    const projects = await catalog.list()

    expect(projects.map((project) => project.name)).toEqual(['alpha', 'beta'])
    expect(projects[0]?.favorite).toBe(true)
  })

  it('should pin a project and report it when toggling through the catalog', async () => {
    const catalog = createProjectCatalog(root, memoryRecency(), memoryFavorites())

    expect(await catalog.toggleFavorite(join(root, 'beta'))).toBe(true)
    expect((await catalog.list())[0]?.name).toBe('beta')
  })
})
