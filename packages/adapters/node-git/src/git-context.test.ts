import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitContext } from './git-context.ts'

let directory = ''

const run = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    stdio: 'ignore',
  })

async function repo(name: string) {
  const path = join(directory, name)
  await mkdir(path, { recursive: true })
  run(path, 'init', '-b', 'main')
  return path
}

async function commit(path: string) {
  await writeFile(join(path, 'a.txt'), 'a')
  run(path, 'add', '.')
  run(path, 'commit', '-m', 'first')
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-git-context-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('createGitContext', () => {
  it('should be undefined when the directory is not inside a repository', async () => {
    expect(await createGitContext().currentBranch(directory)).toBeUndefined()
  })

  it('should name the checked out branch when asked from a subfolder of the repository', async () => {
    const path = await repo('backend')
    await commit(path)
    run(path, 'checkout', '-b', 'feat/add-login')
    await mkdir(join(path, 'packages', 'api'), { recursive: true })

    const branch = await createGitContext().currentBranch(join(path, 'packages', 'api'))

    expect(branch).toBe('feat/add-login')
  })

  it('should name the branch when the repository has no commit yet', async () => {
    const path = await repo('new')

    expect(await createGitContext().currentBranch(path)).toBe('main')
  })

  it('should be undefined when the HEAD is detached', async () => {
    const path = await repo('detached')
    await commit(path)
    run(path, 'checkout', '--detach')

    expect(await createGitContext().currentBranch(path)).toBeUndefined()
  })
})
