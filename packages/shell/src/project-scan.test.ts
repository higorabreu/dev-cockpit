import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectScanner } from './project-scan.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-projects-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const repo = (...parts: string[]) => mkdir(join(root, ...parts, '.git'), { recursive: true })

describe('createProjectScanner', () => {
  it('should list a repository at the first level when scanning the root', async () => {
    await repo('alpha')

    const projects = await createProjectScanner(root).list()

    expect(projects).toEqual([{ name: 'alpha', path: join(root, 'alpha') }])
  })

  it('should find a repository one folder below a grouping folder when scanning', async () => {
    await repo('group', 'beta')

    const projects = await createProjectScanner(root).list()

    expect(projects.map((project) => project.name)).toEqual(['beta'])
  })

  it('should not descend into a repository when scanning', async () => {
    await repo('alpha')
    await repo('alpha', 'vendor')

    const projects = await createProjectScanner(root).list()

    expect(projects.map((project) => project.name)).toEqual(['alpha'])
  })

  it('should accept a submodule marker file as a repository when scanning', async () => {
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'sub', '.git'), 'gitdir: ../.git/modules/sub')

    const projects = await createProjectScanner(root).list()

    expect(projects.map((project) => project.name)).toEqual(['sub'])
  })

  it('should ignore hidden folders and plain folders when scanning', async () => {
    await repo('.hidden')
    await mkdir(join(root, 'plain'))

    const projects = await createProjectScanner(root).list()

    expect(projects).toEqual([])
  })

  it('should return the projects sorted by name when scanning', async () => {
    await repo('zeta')
    await repo('alpha')

    const projects = await createProjectScanner(root).list()

    expect(projects.map((project) => project.name)).toEqual(['alpha', 'zeta'])
  })

  it('should return nothing when the root does not exist', async () => {
    const projects = await createProjectScanner(join(root, 'missing')).list()

    expect(projects).toEqual([])
  })
})
