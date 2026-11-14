import { execFileSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DiffOutcome, DiffRequest, ErrorBody, Result } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitDiffSource } from './git-diff.ts'

let directory = ''

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args],
    { cwd, stdio: 'ignore' },
  )

let tick = 0
// Each commit a second later, so the most recent merge base is told apart
async function commit(path: string, file: string) {
  tick += 1
  await writeFile(join(path, file), `${file} ${tick}\n`)
  git(path, 'add', '.')
  const date = `${1_700_000_000 + tick} +0000`
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', file, '--date', date],
    { cwd: path, stdio: 'ignore', env: { ...process.env, GIT_COMMITTER_DATE: date } },
  )
}

// A bare remote with main and develop, as git flow keeps them, and a clone that knows both
async function flow() {
  const remote = join(directory, 'remote.git')
  const seed = join(directory, 'seed')
  git(directory, 'init', '-q', '--bare', '-b', 'main', remote)
  git(directory, 'init', '-q', '-b', 'main', seed)
  await commit(seed, 'readme.md')
  git(seed, 'checkout', '-q', '-b', 'develop')
  await commit(seed, 'feature-a.ts')
  git(seed, 'remote', 'add', 'origin', remote)
  git(seed, 'push', '-q', 'origin', 'main', 'develop')
  const clone = join(directory, 'clone')
  git(directory, 'clone', '-q', remote, clone)
  return clone
}

// A bare remote whose default branch is trunk, with dev one commit ahead, its seed and a clone
async function trunkBased() {
  const remote = join(directory, 'trunk.git')
  const seed = join(directory, 'trunk-seed')
  git(directory, 'init', '-q', '--bare', '-b', 'trunk', remote)
  git(directory, 'init', '-q', '-b', 'trunk', seed)
  await commit(seed, 'readme.md')
  git(seed, 'checkout', '-q', '-b', 'dev')
  await commit(seed, 'dev.ts')
  git(seed, 'remote', 'add', 'origin', remote)
  git(seed, 'push', '-q', 'origin', 'trunk', 'dev')
  const clone = join(directory, 'trunk-clone')
  git(directory, 'clone', '-q', remote, clone)
  return { remote, seed, clone }
}

// A fresh clone checked out on one branch: its reflog says nothing about where the branch started
function freshClone(remote: string, branch: string) {
  const path = join(directory, `fresh-${branch.replaceAll('/', '-')}`)
  git(directory, 'clone', '-q', '-b', branch, remote, path)
  return path
}

const request = (cwd: string, extra: Partial<DiffRequest> = {}): DiffRequest => ({
  cwd,
  scope: 'branch',
  ignoreWhitespace: false,
  ...extra,
})

function okDiff(result: Result<DiffOutcome, ErrorBody>) {
  if (!result.ok || result.value.kind !== 'ok')
    throw new Error(`invariant: ${JSON.stringify(result)}`)
  return result.value.diff
}

const files = (result: Result<DiffOutcome, ErrorBody>) =>
  okDiff(result).files.map((file) => file.path)

beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'dck-base-')))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('the base of the branch scope', () => {
  it('should compare with the branch the current one was created from when it came from develop', async () => {
    const path = await flow()
    git(path, 'checkout', '-q', '-b', 'feat/login', 'origin/develop')
    await commit(path, 'login.ts')

    const result = await createGitDiffSource().diff(request(path))

    expect(okDiff(result).branch.base).toEqual({ name: 'origin/develop', source: 'created' })
    expect(files(result)).toEqual(['login.ts'])
  })

  it('should prefer the local copy when the branch was switched to from a local develop', async () => {
    const path = await flow()
    git(path, 'checkout', '-q', 'develop')
    git(path, 'switch', '-q', '-c', 'feat/report', 'develop')
    await commit(path, 'report.ts')

    const diff = okDiff(await createGitDiffSource().diff(request(path)))

    expect(diff.branch.base).toEqual({ name: 'develop', source: 'created' })
    expect(diff.branch.candidates).toEqual(['develop', 'main'])
  })

  it('should follow the merge base VS Code wrote when the branch has one', async () => {
    const path = await flow()
    git(path, 'checkout', '-q', '-b', 'feat/vscode', 'main')
    git(path, 'config', 'branch.feat/vscode.vscode-merge-base', 'origin/develop')

    const diff = okDiff(await createGitDiffSource().diff(request(path)))

    expect(diff.branch.base).toEqual({ name: 'origin/develop', source: 'vscode' })
  })

  it('should fall to the nearest base when a fetched branch was only checked out', async () => {
    const path = await flow()
    const seed = join(directory, 'seed')
    git(seed, 'checkout', '-q', '-b', 'feat/shared', 'develop')
    await commit(seed, 'shared.ts')
    git(seed, 'push', '-q', 'origin', 'feat/shared')
    git(path, 'fetch', '-q', 'origin')
    git(path, 'checkout', '-q', 'feat/shared')

    const diff = okDiff(await createGitDiffSource().diff(request(path)))

    expect(diff.branch.base).toEqual({ name: 'origin/develop', source: 'nearest' })
    expect(diff.files.map((file) => file.path)).toEqual(['shared.ts'])
  })

  it('should use the base the user chose and say so', async () => {
    const path = await flow()
    git(path, 'checkout', '-q', '-b', 'feat/login', 'origin/develop')

    const diff = okDiff(await createGitDiffSource().diff(request(path, { base: 'main' })))

    expect(diff.branch.base).toEqual({ name: 'main', source: 'chosen' })
    expect(diff.branch.found).toEqual({ name: 'origin/develop', source: 'created' })
    expect(diff.files.map((file) => file.path)).toEqual(['feature-a.ts'])
  })

  it('should compare with trunk when the branch was created from it and has no upstream yet', async () => {
    const { clone } = await trunkBased()
    git(clone, 'checkout', '-q', '-b', 'feat/x', 'trunk')
    await commit(clone, 'x.ts')

    const result = await createGitDiffSource().diff(request(clone))

    expect(okDiff(result).branch).toMatchObject({
      base: { name: 'trunk', source: 'created' },
      upstream: undefined,
    })
    expect(files(result)).toEqual(['x.ts'])
  })

  it('should find dev as the nearest base when a fresh clone has no reflog for the branch', async () => {
    const { remote, seed } = await trunkBased()
    git(seed, 'checkout', '-q', '-b', 'feat/y', 'dev')
    await commit(seed, 'y.ts')
    git(seed, 'push', '-q', 'origin', 'feat/y')
    const path = freshClone(remote, 'feat/y')

    const diff = okDiff(await createGitDiffSource().diff(request(path)))

    expect(diff.branch.base).toEqual({ name: 'origin/dev', source: 'nearest' })
    expect(diff.branch.candidates).toEqual(['origin/dev', 'origin/trunk'])
    expect(diff.files.map((file) => file.path)).toEqual(['y.ts'])
  })

  it('should never take a branch that already contains HEAD when it is the closest one', async () => {
    const { remote, seed } = await trunkBased()
    git(seed, 'checkout', '-q', '-b', 'feat/a', 'dev')
    await commit(seed, 'a.ts')
    git(seed, 'checkout', '-q', '-b', 'feat/b')
    await commit(seed, 'b.ts')
    git(seed, 'push', '-q', 'origin', 'feat/a', 'feat/b')
    const path = freshClone(remote, 'feat/a')

    const diff = okDiff(await createGitDiffSource().diff(request(path)))

    expect(diff.branch.base).toEqual({ name: 'origin/dev', source: 'nearest' })
    expect(diff.branch.candidates).not.toContain('origin/feat/b')
  })

  it('should find no base on the remote default branch and compare the unpushed commits with its upstream', async () => {
    const path = await flow()
    await commit(path, 'hotfix.ts')
    await writeFile(join(path, 'notes.txt'), 'draft\n')

    const base = await createGitDiffSource().diff(request(path))
    const unpushed = okDiff(await createGitDiffSource().diff(request(path, { scope: 'unpushed' })))

    expect(base).toEqual({ ok: true, value: { kind: 'no-base', root: path } })
    expect(unpushed.branch).toMatchObject({
      base: undefined,
      found: undefined,
      upstream: 'origin/main',
      candidates: ['origin/develop'],
    })
    expect(unpushed.files.map((file) => file.path)).toEqual(['hotfix.ts', 'notes.txt'])
  })

  it('should compare with the base the user picks on the remote default branch', async () => {
    const path = await flow()
    await commit(path, 'hotfix.ts')

    const diff = okDiff(await createGitDiffSource().diff(request(path, { base: 'origin/develop' })))

    expect(diff.branch.base).toEqual({ name: 'origin/develop', source: 'chosen' })
    expect(diff.files.map((file) => file.path)).toEqual(['hotfix.ts'])
  })

  it('should say there is no upstream when the branch was never pushed', async () => {
    const path = join(directory, 'local')
    git(directory, 'init', '-q', '-b', 'main', path)
    await commit(path, 'a.txt')

    const uncommitted = okDiff(
      await createGitDiffSource().diff(request(path, { scope: 'uncommitted' })),
    )
    const unpushed = await createGitDiffSource().diff(request(path, { scope: 'unpushed' }))

    expect(uncommitted.branch).toMatchObject({ base: undefined, upstream: undefined })
    expect(unpushed).toEqual({ ok: true, value: { kind: 'no-upstream', root: path } })
  })
})
