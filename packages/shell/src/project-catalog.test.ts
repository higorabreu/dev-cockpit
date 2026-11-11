import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectCatalog } from './project-catalog.ts'

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
    const catalog = createProjectCatalog(root, memoryRecency([join(root, 'beta')]))

    const projects = await catalog.list()

    expect(projects.map((project) => project.name)).toEqual(['beta', 'alpha'])
  })

  it('should move a project to the top when it is touched', async () => {
    const catalog = createProjectCatalog(root, memoryRecency())

    await catalog.touch(join(root, 'beta'))
    const projects = await catalog.list()

    expect(projects[0]?.name).toBe('beta')
  })
})
