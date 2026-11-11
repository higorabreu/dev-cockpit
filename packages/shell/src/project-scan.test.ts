import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanProjects } from './project-scan.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-projects-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const repo = (...parts: string[]) => mkdir(join(root, ...parts, '.git'), { recursive: true })

describe('createProjectScanner', () => {
  it('should list a repository at the first level when scanning the root', async () => {
    await repo('alpha')

    const projects = await scanProjects(root)

    expect(projects).toMatchObject([{ name: 'alpha', path: join(root, 'alpha') }])
  })

  it('should find a repository one folder below a grouping folder when scanning', async () => {
    await repo('group', 'beta')

    const projects = await scanProjects(root)

    expect(projects.map((project) => project.name)).toEqual(['beta'])
  })

  it('should not descend into a repository when scanning', async () => {
    await repo('alpha')
    await repo('alpha', 'vendor')

    const projects = await scanProjects(root)

    expect(projects.map((project) => project.name)).toEqual(['alpha'])
  })

  it('should accept a submodule marker file as a repository when scanning', async () => {
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'sub', '.git'), 'gitdir: ../.git/modules/sub')

    const projects = await scanProjects(root)

    expect(projects.map((project) => project.name)).toEqual(['sub'])
  })

  it('should ignore hidden folders and plain folders when scanning', async () => {
    await repo('.hidden')
    await mkdir(join(root, 'plain'))

    const projects = await scanProjects(root)

    expect(projects).toEqual([])
  })

  it('should return the projects sorted by name when scanning', async () => {
    await repo('zeta')
    await repo('alpha')

    const projects = await scanProjects(root)

    expect(projects.map((project) => project.name)).toEqual(['alpha', 'zeta'])
  })

  it('should return nothing when the root does not exist', async () => {
    const projects = await scanProjects(join(root, 'missing'))

    expect(projects).toEqual([])
  })

  it('should list the submodules declared in .gitmodules when a repository has them', async () => {
    await repo('main')
    await repo('main', 'backend')
    await repo('main', 'frontend')
    await writeFile(
      join(root, 'main', '.gitmodules'),
      '[submodule "backend"]\n\tpath = backend\n\turl = x\n[submodule "frontend"]\n\tpath = frontend\n\turl = y\n',
    )

    const projects = await scanProjects(root)

    expect(projects.map((project) => project.name).sort()).toEqual(['backend', 'frontend', 'main'])
  })

  it('should skip a declared submodule that is not checked out when scanning', async () => {
    await repo('main')
    await writeFile(join(root, 'main', '.gitmodules'), '[submodule "gone"]\n\tpath = gone\n')

    const projects = await scanProjects(root)

    expect(projects.map((project) => project.name)).toEqual(['main'])
  })

  it('should report the repository activity when the reflog exists', async () => {
    await mkdir(join(root, 'alpha', '.git', 'logs'), { recursive: true })
    await writeFile(join(root, 'alpha', '.git', 'logs', 'HEAD'), 'x')

    const [project] = await scanProjects(root)

    expect(project?.activity).toBeGreaterThan(0)
  })

  it('should find deeper repositories when the depth is raised', async () => {
    await repo('a', 'b', 'c', 'deep')

    expect(await scanProjects(root, 2)).toEqual([])
    expect((await scanProjects(root, 4)).map((project) => project.name)).toEqual(['deep'])
  })
})
