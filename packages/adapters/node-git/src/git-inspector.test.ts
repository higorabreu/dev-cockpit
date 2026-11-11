import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitInspector } from './git-inspector.ts'

let directory = ''

const run = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'protocol.file.allow=always', ...args],
    {
      cwd,
      stdio: 'ignore',
    },
  )

const inspector = () => createGitInspector({ submoduleTtlMs: 0 })

async function repo(name: string, files: Record<string, string> = { 'a.txt': 'a' }) {
  const path = join(directory, name)
  await mkdir(path, { recursive: true })
  run(path, 'init', '-b', 'main')
  for (const [file, content] of Object.entries(files)) await writeFile(join(path, file), content)
  run(path, 'add', '.')
  run(path, 'commit', '-m', 'first')
  return path
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-git-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('createGitInspector', () => {
  it('should be undefined when the directory is not inside a repository', async () => {
    expect(await inspector().status(directory)).toBeUndefined()
  })

  it('should report the branch and a clean tree when the repository has a commit', async () => {
    const path = await repo('clean')

    const status = await inspector().status(path)

    expect(status).toMatchObject({ branch: 'main', changed: 0, staged: [], changes: [], ahead: 0 })
    expect(status?.upstream).toBeUndefined()
  })

  it('should separate staged, modified and untracked files when the tree is dirty', async () => {
    const path = await repo('dirty')
    await writeFile(join(path, 'a.txt'), 'changed')
    await writeFile(join(path, 'staged.txt'), 'new')
    run(path, 'add', 'staged.txt')
    await writeFile(join(path, 'loose.txt'), 'x')

    const status = await inspector().status(path)

    expect(status?.staged).toEqual([{ status: 'A', path: 'staged.txt' }])
    expect(status?.changes).toEqual([
      { status: 'M', path: 'a.txt' },
      { status: 'U', path: 'loose.txt' },
    ])
    expect(status?.changed).toBe(3)
  })

  it('should list the commits that were not pushed yet when the branch is ahead of its upstream', async () => {
    const bare = join(directory, 'remote.git')
    run(directory, 'init', '--bare', '-b', 'main', bare)
    const path = await repo('local')
    run(path, 'remote', 'add', 'origin', bare)
    run(path, 'push', '-u', 'origin', 'main')
    await writeFile(join(path, 'b.txt'), 'b')
    run(path, 'add', '.')
    run(path, 'commit', '-m', 'second change')

    const status = await inspector().status(path)

    expect(status).toMatchObject({ upstream: 'origin/main', ahead: 1, behind: 0 })
    expect(status?.outgoing.map((commit) => commit.subject)).toEqual(['second change'])
  })

  it('should list only the submodules with something pending when a submodule has a new commit', async () => {
    const one = await repo('one')
    const two = await repo('two')
    const parent = await repo('parent')
    run(parent, 'submodule', 'add', one, 'one')
    run(parent, 'submodule', 'add', two, 'two')
    run(parent, 'commit', '-m', 'add submodules')
    await writeFile(join(parent, 'one', 'extra.txt'), 'x')
    run(join(parent, 'one'), 'add', '.')
    run(join(parent, 'one'), 'commit', '-m', 'inside one')

    const status = await inspector().status(parent)

    expect(status?.submodules.map((module) => [module.path, module.pointerChanged])).toEqual([
      ['one', true],
    ])
    expect(status?.submodulesClean).toBe(1)
    expect(status?.changes).toEqual([])
  })

  it('should count changed files inside a submodule when its tree is dirty', async () => {
    const one = await repo('one')
    const parent = await repo('parent')
    run(parent, 'submodule', 'add', one, 'one')
    run(parent, 'commit', '-m', 'add submodule')
    await writeFile(join(parent, 'one', 'a.txt'), 'dirty')

    const status = await inspector().status(parent)

    expect(status?.submodules[0]).toMatchObject({ path: 'one', changed: 1, pointerChanged: false })
  })
})
