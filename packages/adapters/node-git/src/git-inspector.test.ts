import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitInspector } from './git-inspector.ts'

let directory = ''

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: directory,
    stdio: 'ignore',
  })

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dck-git-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('createGitInspector', () => {
  it('should be undefined when the directory is not inside a repository', async () => {
    expect(await createGitInspector().status(directory)).toBeUndefined()
  })

  it('should report the branch and a clean tree when the repository has a commit', async () => {
    git('init', '-b', 'main')
    await writeFile(join(directory, 'a.txt'), 'a')
    git('add', '.')
    git('commit', '-m', 'first')

    const status = await createGitInspector().status(directory)

    expect(status).toMatchObject({ branch: 'main', changed: 0, ahead: 0, behind: 0 })
  })

  it('should count the changed and untracked files when the tree is dirty', async () => {
    git('init', '-b', 'main')
    await writeFile(join(directory, 'a.txt'), 'a')
    git('add', '.')
    git('commit', '-m', 'first')
    await writeFile(join(directory, 'a.txt'), 'changed')
    await writeFile(join(directory, 'b.txt'), 'new')

    const status = await createGitInspector().status(directory)

    expect(status?.changed).toBe(2)
  })

  it('should report the repository root when asked from a subfolder', async () => {
    git('init', '-b', 'main')
    await writeFile(join(directory, 'a.txt'), 'a')

    const status = await createGitInspector().status(directory)

    expect(status?.root.endsWith(directory.split('/').at(-1) ?? '')).toBe(true)
  })
})
