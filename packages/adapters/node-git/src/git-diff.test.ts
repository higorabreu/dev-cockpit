import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DiffOutcome, DiffRequest, ErrorBody, Result } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitDiffSource, statusModules, statusPaths, untrackedModules } from './git-diff.ts'
import type { GitAnswer } from './git-run.ts'

let directory = ''

const run = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...args],
    { cwd, stdio: 'ignore' },
  )

async function repo(name: string, files: Record<string, string | Buffer>) {
  const path = join(directory, name)
  await mkdir(path, { recursive: true })
  run(path, 'init', '-b', 'main')
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(path, file, '..'), { recursive: true })
    await writeFile(join(path, file), content)
  }
  run(path, 'add', '.')
  run(path, 'commit', '-m', 'first')
  return path
}

const request = (cwd: string, extra: Partial<DiffRequest> = {}): DiffRequest => ({
  cwd,
  scope: 'uncommitted',
  ignoreWhitespace: false,
  ...extra,
})

function okDiff(result: Result<DiffOutcome, ErrorBody>) {
  if (!result.ok || result.value.kind !== 'ok')
    throw new Error(`invariant: ${JSON.stringify(result)}`)
  return result.value.diff
}

const numbered = (count: number, mark = '') =>
  `${Array.from({ length: count }, (_, index) => `line ${index + 1}${mark}`).join('\n')}\n`

beforeEach(async () => {
  // macOS links /var to /private/var and Git reports the real path
  directory = await realpath(await mkdtemp(join(tmpdir(), 'dck-diff-')))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('createGitDiffSource', () => {
  it('should say so when the folder is not inside a repository', async () => {
    const result = await createGitDiffSource().diff(request(directory))

    expect(result).toEqual({ ok: true, value: { kind: 'not-repository' } })
  })

  it('should list modified, deleted, renamed and untracked files when the tree has uncommitted work', async () => {
    const path = await repo('work', {
      'src/app.ts': numbered(40),
      'old.py': 'print(1)\n',
      'docs/guide.md': numbered(12),
      '.gitignore': 'ignored.log\n',
    })
    await writeFile(join(path, 'src/app.ts'), numbered(40).replace('line 20\n', 'line twenty\n'))
    await unlink(join(path, 'old.py'))
    run(path, 'mv', 'docs/guide.md', 'docs/manual.md')
    await writeFile(join(path, 'notes.txt'), 'one\ntwo\n')
    await writeFile(join(path, 'ignored.log'), 'noise\n')

    const diff = okDiff(await createGitDiffSource().diff(request(join(path, 'src'))))

    expect(diff.root).toBe(path)
    expect(diff.files.map((file) => [file.path, file.status, file.untracked])).toEqual([
      ['docs/manual.md', 'renamed', false],
      ['notes.txt', 'added', true],
      ['old.py', 'deleted', false],
      ['src/app.ts', 'modified', false],
    ])
    expect(diff.files[0]?.oldPath).toBe('docs/guide.md')
    expect(diff.files.find((file) => file.path === 'src/app.ts')?.newLineCount).toBe(40)
    expect([diff.additions, diff.deletions]).toEqual([3, 2])
  })

  it('should leave out a change of whitespace only when asked to ignore whitespace', async () => {
    const path = await repo('spaces', { 'a.ts': 'const a = 1\nconst b = 2\n' })
    await writeFile(join(path, 'a.ts'), 'const a  =  1\nconst b = 3\n')
    const source = createGitDiffSource()

    const all = okDiff(await source.diff(request(path)))
    const visible = okDiff(await source.diff(request(path, { ignoreWhitespace: true })))

    expect(all.deletions).toBe(2)
    expect(visible.deletions).toBe(1)
  })

  it('should compare the branch and the working tree with the merge base when the scope is the branch', async () => {
    const path = await repo('branch', { 'a.txt': 'a\n' })
    run(path, 'checkout', '-b', 'feat/x')
    await writeFile(join(path, 'b.txt'), 'b\n')
    run(path, 'add', '.')
    run(path, 'commit', '-m', 'second')
    run(path, 'checkout', 'main')
    await writeFile(join(path, 'main-only.txt'), 'm\n')
    run(path, 'add', '.')
    run(path, 'commit', '-m', 'ahead on main')
    run(path, 'checkout', 'feat/x')
    await writeFile(join(path, 'a.txt'), 'a changed\n')
    const source = createGitDiffSource()

    const branch = okDiff(await source.diff(request(path, { scope: 'branch' })))
    const uncommitted = okDiff(await source.diff(request(path)))

    expect(branch.branch.base).toEqual({ name: 'main', source: 'created' })
    expect(uncommitted.branch.base?.name).toBe('main')
    expect(branch.files.map((file) => file.path)).toEqual(['a.txt', 'b.txt'])
    expect(uncommitted.files.map((file) => file.path)).toEqual(['a.txt'])
  })

  it("should compare with the remote's default branch when origin/HEAD is set", async () => {
    const bare = join(directory, 'remote.git')
    run(directory, 'init', '--bare', '-b', 'trunk', bare)
    const path = await repo('clone', { 'a.txt': 'a\n' })
    run(path, 'branch', '-m', 'trunk')
    run(path, 'remote', 'add', 'origin', bare)
    run(path, 'push', '-u', 'origin', 'trunk')
    run(path, 'remote', 'set-head', 'origin', 'trunk')
    run(path, 'checkout', '-b', 'topic')
    await writeFile(join(path, 'c.txt'), 'c\n')
    run(path, 'add', '.')
    run(path, 'commit', '-m', 'topic work')

    const diff = okDiff(await createGitDiffSource().diff(request(path, { scope: 'branch' })))

    expect(diff.branch.base?.name).toBe('trunk')
    expect(diff.files.map((file) => file.path)).toEqual(['c.txt'])
  })

  it('should say there is no base when the repository has no default branch to compare with', async () => {
    const path = await repo('lonely', { 'a.txt': 'a\n' })
    run(path, 'branch', '-m', 'trunk')

    const result = await createGitDiffSource().diff(request(path, { scope: 'branch' }))

    expect(result).toEqual({ ok: true, value: { kind: 'no-base', root: path } })
  })

  it('should show every file as added when the repository has no commit yet', async () => {
    const path = join(directory, 'fresh')
    await mkdir(path)
    run(path, 'init', '-b', 'main')
    await writeFile(join(path, 'staged.txt'), 'x\n')
    run(path, 'add', 'staged.txt')
    await writeFile(join(path, 'loose.txt'), 'y\n')

    const diff = okDiff(await createGitDiffSource().diff(request(path)))

    expect(diff.files.map((file) => [file.path, file.status])).toEqual([
      ['loose.txt', 'added'],
      ['staged.txt', 'added'],
    ])
  })

  it('should describe binary, CRLF, mode, generated and non-UTF-8 files for what they are', async () => {
    const path = await repo('kinds', {
      'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]),
      'win.txt': 'one\r\ntwo\r\n',
      'run.sh': 'echo hi\n',
      'api/schema.ts': 'export {}\n',
      'legacy.txt': Buffer.from('caf\xe9\n', 'latin1'),
      '.gitattributes': 'api/schema.ts linguist-generated\n',
    })
    await writeFile(join(path, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 9, 9]))
    await writeFile(join(path, 'win.txt'), 'one\r\nTWO\r\n')
    await chmod(join(path, 'run.sh'), 0o755)
    await writeFile(join(path, 'api/schema.ts'), 'export const a = 1\n')
    await writeFile(join(path, 'legacy.txt'), Buffer.from('caf\xe9 au lait\n', 'latin1'))
    await writeFile(join(path, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')

    const diff = okDiff(await createGitDiffSource().diff(request(path)))
    const byPath = new Map(diff.files.map((file) => [file.path, file]))

    expect(byPath.get('logo.png')).toMatchObject({ binary: true, size: 7 })
    expect(byPath.get('win.txt')).toMatchObject({ crlf: true, additions: 1 })
    expect(byPath.get('run.sh')).toMatchObject({ oldMode: '100644', newMode: '100755' })
    expect(byPath.get('api/schema.ts')?.generated).toBe(true)
    expect(byPath.get('pnpm-lock.yaml')).toMatchObject({ generated: true, untracked: true })
    expect(byPath.get('legacy.txt')).toMatchObject({ binary: true, nonUtf8: true })
  })

  it('should list a very large untracked file with its size only when it is over the limit', async () => {
    const path = await repo('large', { 'a.txt': 'a\n' })
    await writeFile(join(path, 'dump.sql'), 'x'.repeat(1024 * 1024 + 1))

    const diff = okDiff(await createGitDiffSource().diff(request(path)))

    expect(diff.files[0]).toMatchObject({ path: 'dump.sql', omitted: true, size: 1024 * 1024 + 1 })
  })

  it('should list every untracked file and read only the first 300 when there are more', async () => {
    // Arrange
    const path = await repo('many', { 'a.txt': 'a\n' })
    await mkdir(join(path, 'gen'))
    for (let index = 0; index < 305; index++) {
      await writeFile(join(path, 'gen', `f${String(index).padStart(3, '0')}.txt`), `${index}\n`)
    }

    // Act
    const diff = okDiff(await createGitDiffSource().diff(request(path)))

    // Assert
    expect(diff.files).toHaveLength(305)
    expect(diff.files.filter((file) => file.unloaded).map((file) => file.path)).toEqual([
      'gen/f300.txt',
      'gen/f301.txt',
      'gen/f302.txt',
      'gen/f303.txt',
      'gen/f304.txt',
    ])
    expect(diff.files[304]).toMatchObject({ untracked: true, status: 'added', hunks: [] })
  })

  it('should read an untracked file as an addition when it is asked for by path', async () => {
    const path = await repo('later', { 'a.txt': 'a\n' })
    await writeFile(join(path, 'notes.txt'), 'one\ntwo\n')

    const result = await createGitDiffSource().untrackedFile(path, 'notes.txt', false)

    expect(result).toMatchObject({
      ok: true,
      value: { path: 'notes.txt', status: 'added', untracked: true, additions: 2, newLineCount: 2 },
    })
  })

  it('should refuse to read an untracked file outside the repository', async () => {
    const path = await repo('outside', { 'a.txt': 'a\n' })
    await writeFile(join(directory, 'secret.txt'), 'no\n')

    const result = await createGitDiffSource().untrackedFile(path, '../secret.txt', false)

    expect(result.ok || result.error.data?.code).toBe('DCK-GIT-004')
  })

  it('should read the working tree lines of a file when it is inside the repository', async () => {
    const path = await repo('lines', { 'a.txt': 'one\r\ntwo\n' })

    const lines = await createGitDiffSource().fileLines(path, 'a.txt')

    expect(lines).toEqual({ ok: true, value: ['one', 'two'] })
  })

  it('should refuse a path or a link that leads outside the repository', async () => {
    const path = await repo('escape', { 'a.txt': 'a\n' })
    await writeFile(join(directory, 'secret.txt'), 'no\n')
    await symlink(join(directory, 'secret.txt'), join(path, 'link.txt'))
    const source = createGitDiffSource()

    const up = await source.fileLines(path, '../secret.txt')
    const linked = await source.fileLines(path, 'link.txt')

    expect(up.ok || up.error.data?.code).toBe('DCK-GIT-004')
    expect(linked.ok || linked.error.data?.code).toBe('DCK-GIT-004')
  })

  it.each([
    [{ kind: 'missing' }, 'DCK-GIT-005'],
    [{ kind: 'timeout' }, 'DCK-GIT-002'],
    [{ kind: 'too-large' }, 'DCK-GIT-003'],
    [{ kind: 'exit', code: 129, stderr: 'usage' }, 'DCK-GIT-001'],
  ] as const)(
    'should fail with a code when git fails reading the diff (%o)',
    async (failure, code) => {
      const path = await repo('fake', { 'a.txt': 'a\n' })
      const fake = async (_cwd: string, args: readonly string[]): Promise<GitAnswer> => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel')
          return { ok: true, stdout: `${path}\n`, code: 0 }
        if (args[0] === 'rev-parse') return { ok: true, stdout: 'abc\n', code: 0 }
        if (args[0] === 'diff' && !args.includes('--no-index')) return { ok: false, failure }
        return { ok: true, stdout: '', code: 0 }
      }

      const result = await createGitDiffSource({ run: fake }).diff(request(path))

      expect(result.ok || result.error.data?.code).toBe(code)
    },
  )
})

const addModule = (cwd: string, source: string, path: string) =>
  run(cwd, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', source, path)

// acme holds libs/lib, which holds vendor/deep, and libs/other
async function nested() {
  const deep = await repo('deep', { 'src/deep.txt': numbered(3) })
  const lib = await repo('lib', { 'x.txt': numbered(3), 'src/util.ts': numbered(3) })
  addModule(lib, deep, 'vendor/deep')
  run(lib, 'commit', '-q', '-m', 'Add the deep module')
  const other = await repo('other', { 'docs/guide.md': numbered(3) })
  const acme = await repo('acme', { 'app.ts': numbered(3) })
  addModule(acme, lib, 'libs/lib')
  addModule(acme, other, 'libs/other')
  run(acme, 'commit', '-q', '-m', 'Add libs')
  run(
    acme,
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'update',
    '--init',
    '--recursive',
    '-q',
  )
  return acme
}

describe('submodules', () => {
  it('should read the own edits of each changed submodule, nested ones too, with its commits apart', async () => {
    // Arrange
    const acme = await nested()
    const lib = join(acme, 'libs/lib')
    await writeFile(join(lib, 'x.txt'), numbered(3, ' committed'))
    run(lib, 'commit', '-q', '-am', 'Fix the parser')
    run(lib, 'commit', '-q', '--allow-empty', '-m', 'Add a fallback')
    await writeFile(join(lib, 'src/util.ts'), `${numbered(3)}edit\n`)
    await writeFile(join(lib, 'untracked.txt'), 'new\n')
    await writeFile(join(lib, 'vendor/deep/src/deep.txt'), `${numbered(3)}deep\n`)
    await writeFile(join(acme, 'libs/other/only.txt'), 'only\n')
    await writeFile(join(acme, 'app.ts'), `${numbered(3)}app\n`)

    // Act
    const diff = okDiff(await createGitDiffSource().diff(request(acme)))

    // Assert
    expect(diff.files.map((file) => [file.path, file.module, file.untracked])).toEqual([
      ['app.ts', undefined, false],
      ['libs/lib/src/util.ts', 'libs/lib', false],
      ['libs/lib/untracked.txt', 'libs/lib', true],
      ['libs/lib/vendor/deep/src/deep.txt', 'libs/lib/vendor/deep', false],
      ['libs/other/only.txt', 'libs/other', true],
    ])
    expect(diff.modules).toEqual([
      { path: 'libs/lib', commits: ['Add a fallback', 'Fix the parser'], commitCount: 2 },
      { path: 'libs/lib/vendor/deep', commits: [], commitCount: 0 },
      { path: 'libs/other', commits: [], commitCount: 0 },
    ])
    const util = diff.files.find((file) => file.path === 'libs/lib/src/util.ts')
    expect(util).toMatchObject({ additions: 1, deletions: 0, newLineCount: 4 })
  })

  it('should read a submodule on a branch with no base from its upstream, else its HEAD, in Base', async () => {
    // Arrange
    const acme = await nested()
    const lib = join(acme, 'libs/lib')
    run(acme, 'checkout', '-q', '-b', 'feat/bump')
    await pulled(acme, 'libs/lib', 'lib', 2)
    await writeFile(join(lib, 'x.txt'), numbered(4))
    run(lib, 'commit', '-q', '-am', 'Grow x')
    run(acme, 'commit', '-q', '-am', 'Bump lib')
    await writeFile(join(lib, 'src/util.ts'), `${numbered(3)}edit\n`)
    const source = createGitDiffSource()
    const scope = request(acme, { scope: 'branch', base: 'main' })

    // Act
    const tracked = okDiff(await source.diff(scope))
    run(lib, 'branch', '-q', '--unset-upstream')
    const alone = okDiff(await source.diff(scope))

    // Assert
    expect(shown(tracked)).toEqual(['libs/lib/src/util.ts', 'libs/lib/x.txt'])
    expect(tracked.modules).toEqual([
      { path: 'libs/lib', commits: ['Grow x', 'Upstream 2', 'Upstream 1'], commitCount: 3 },
    ])
    expect(shown(alone)).toEqual(['libs/lib/src/util.ts'])
  })

  it('should keep the single entry of a submodule whose recorded commit it does not have', async () => {
    // Arrange
    const acme = await nested()
    run(acme, 'update-index', '--cacheinfo', `160000,${'1'.repeat(40)},libs/other`)
    run(acme, 'commit', '-q', '-m', 'Point other to a commit it lacks')

    // Act
    const diff = okDiff(await createGitDiffSource().diff(request(acme)))

    // Assert
    expect(diff.files.map((file) => [file.path, file.submodule, file.module])).toEqual([
      ['libs/other', true, undefined],
    ])
    expect(diff.modules).toEqual([])
  })

  it('should count the untracked files of submodules in the reading limit', async () => {
    // Arrange
    const acme = await nested()
    await mkdir(join(acme, 'gen'))
    for (let index = 0; index < 299; index++) {
      await writeFile(join(acme, 'gen', `f${String(index).padStart(3, '0')}.txt`), `${index}\n`)
    }
    await writeFile(join(acme, 'libs/lib/a.txt'), 'a\n')
    await writeFile(join(acme, 'libs/lib/b.txt'), 'b\n')

    // Act
    const diff = okDiff(await createGitDiffSource().diff(request(acme)))

    // Assert
    expect(diff.files).toHaveLength(301)
    expect(diff.files.filter((file) => file.unloaded).map((file) => file.path)).toEqual([
      'libs/lib/b.txt',
    ])
  })
})

// Commits the submodule's source gets and the submodule pulls: on its upstream, none of them the user's
async function pulled(acme: string, module: string, source: string, count: number) {
  for (let index = 1; index <= count; index++) {
    await writeFile(join(directory, source, `upstream-${index}.txt`), `${index}\n`)
    run(join(directory, source), 'add', '.')
    run(join(directory, source), 'commit', '-q', '-m', `Upstream ${index}`)
  }
  // A detached submodule, as `submodule update` leaves it, moves the same way
  run(join(acme, module), '-c', 'protocol.file.allow=always', 'fetch', '-q', 'origin')
  run(join(acme, module), 'reset', '-q', '--keep', 'origin/main')
}

// The parent gets an upstream of its own, so its Unpushed scope has something to compare with
function publish(acme: string) {
  const remote = join(directory, 'acme-remote.git')
  run(directory, 'init', '-q', '--bare', remote)
  run(acme, 'remote', 'add', 'origin', remote)
  run(acme, 'push', '-q', '-u', 'origin', 'main')
}

const shown = (diff: ReturnType<typeof okDiff>) => diff.files.map((file) => file.path)

describe('submodules in their own scope', () => {
  it('should list only the edits of a submodule whose HEAD moved past the recorded commit in Uncommitted', async () => {
    // Arrange
    const acme = await nested()
    await pulled(acme, 'libs/lib', 'lib', 3)
    await writeFile(join(acme, 'libs/lib/x.txt'), `${numbered(3)}edit\n`)

    // Act
    const diff = okDiff(await createGitDiffSource().diff(request(acme)))

    // Assert
    expect(shown(diff)).toEqual(['libs/lib/x.txt'])
    expect(diff.modules).toEqual([
      { path: 'libs/lib', commits: ['Upstream 3', 'Upstream 2', 'Upstream 1'], commitCount: 3 },
    ])
  })

  it('should show the header with no files when only the pointer moved', async () => {
    // Arrange
    const acme = await nested()
    await pulled(acme, 'libs/other', 'other', 2)

    // Act
    const diff = okDiff(await createGitDiffSource().diff(request(acme)))

    // Assert
    expect(diff.files).toEqual([])
    expect(diff.modules).toEqual([
      { path: 'libs/other', commits: ['Upstream 2', 'Upstream 1'], commitCount: 2 },
    ])
  })

  it('should list the unpushed commits and edits of a submodule against its own upstream', async () => {
    // Arrange
    const acme = await nested()
    publish(acme)
    const lib = join(acme, 'libs/lib')
    await pulled(acme, 'libs/lib', 'lib', 2)
    await writeFile(join(lib, 'x.txt'), numbered(4))
    run(lib, 'commit', '-q', '-am', 'Grow x')
    await writeFile(join(lib, 'src/util.ts'), `${numbered(3)}edit\n`)

    // Act
    const diff = okDiff(await createGitDiffSource().diff(request(acme, { scope: 'unpushed' })))

    // Assert
    expect(shown(diff)).toEqual(['libs/lib/src/util.ts', 'libs/lib/x.txt'])
    expect(diff.modules).toEqual([
      { path: 'libs/lib', commits: ['Grow x', 'Upstream 2', 'Upstream 1'], commitCount: 3 },
    ])
  })

  it('should read a submodule with an unpushed commit when the parent already recorded it', async () => {
    // Arrange
    const acme = await nested()
    const lib = join(acme, 'libs/lib')
    await writeFile(join(lib, 'x.txt'), numbered(4))
    run(lib, 'commit', '-q', '-am', 'Grow x')
    run(acme, 'commit', '-q', '-am', 'Bump lib')
    publish(acme)

    // Act
    const unpushed = okDiff(await createGitDiffSource().diff(request(acme, { scope: 'unpushed' })))
    const uncommitted = okDiff(await createGitDiffSource().diff(request(acme)))

    // Assert
    expect(shown(unpushed)).toEqual(['libs/lib/x.txt'])
    expect(unpushed.modules).toEqual([{ path: 'libs/lib', commits: [], commitCount: 0 }])
    expect(uncommitted.files).toEqual([])
    expect(uncommitted.modules).toEqual([])
  })

  it('should list only the edits of a submodule with no upstream when the scope is Unpushed', async () => {
    // Arrange
    const acme = await nested()
    publish(acme)
    const other = join(acme, 'libs/other')
    run(other, 'branch', '-q', '--unset-upstream')
    await writeFile(join(other, 'docs/guide.md'), numbered(4))
    run(other, 'commit', '-q', '-am', 'Grow the guide')
    await writeFile(join(other, 'notes.md'), 'notes\n')

    // Act
    const result = await createGitDiffSource().diff(request(acme, { scope: 'unpushed' }))

    // Assert
    const diff = okDiff(result)
    expect(shown(diff)).toEqual(['libs/other/notes.md'])
    expect(diff.modules).toEqual([
      { path: 'libs/other', commits: ['Grow the guide'], commitCount: 1 },
    ])
  })

  it("should compare a submodule's branch with its own base when the scope is Base", async () => {
    // Arrange
    const acme = await nested()
    const lib = join(acme, 'libs/lib')
    run(acme, 'checkout', '-q', '-b', 'feat/bump')
    await pulled(acme, 'libs/lib', 'lib', 2)
    run(lib, 'checkout', '-q', '-b', 'feat/parser')
    await writeFile(join(lib, 'x.txt'), numbered(4))
    run(lib, 'commit', '-q', '-am', 'Grow x')
    run(acme, 'commit', '-q', '-am', 'Bump lib')

    // Act
    const diff = okDiff(
      await createGitDiffSource().diff(request(acme, { scope: 'branch', base: 'main' })),
    )

    // Assert
    expect(shown(diff)).toEqual(['libs/lib/x.txt'])
    expect(diff.modules).toEqual([
      { path: 'libs/lib', commits: ['Grow x', 'Upstream 2', 'Upstream 1'], commitCount: 3 },
    ])
  })

  it('should compare a detached submodule from the commit recorded at the base when the scope is Base', async () => {
    // Arrange
    const acme = await nested()
    const lib = join(acme, 'libs/lib')
    run(acme, 'checkout', '-q', '-b', 'feat/bump')
    await pulled(acme, 'libs/lib', 'lib', 2)
    run(lib, 'checkout', '-q', '--detach')
    run(acme, 'commit', '-q', '-am', 'Bump lib')

    // Act
    const diff = okDiff(
      await createGitDiffSource().diff(request(acme, { scope: 'branch', base: 'main' })),
    )

    // Assert
    expect(shown(diff)).toEqual(['libs/lib/upstream-1.txt', 'libs/lib/upstream-2.txt'])
    expect(diff.modules).toEqual([
      { path: 'libs/lib', commits: ['Upstream 2', 'Upstream 1'], commitCount: 2 },
    ])
  })

  it('should apply the scope inside a nested submodule the same way', async () => {
    // Arrange
    const acme = await nested()
    await pulled(join(acme, 'libs/lib'), 'vendor/deep', 'deep', 2)
    await writeFile(join(acme, 'libs/lib/vendor/deep/src/deep.txt'), `${numbered(3)}deep\n`)

    // Act
    const diff = okDiff(await createGitDiffSource().diff(request(acme)))

    // Assert
    expect(shown(diff)).toEqual(['libs/lib/vendor/deep/src/deep.txt'])
    expect(diff.modules).toEqual([
      { path: 'libs/lib', commits: [], commitCount: 0 },
      { path: 'libs/lib/vendor/deep', commits: ['Upstream 2', 'Upstream 1'], commitCount: 2 },
    ])
  })
})

describe('untrackedModules', () => {
  it('should name the submodules with untracked files only when the status marks them', () => {
    const output = [
      '1 .M S..U 160000 160000 160000 aaa aaa libs/other',
      '1 .M SCM. 160000 160000 160000 aaa aaa libs/lib',
      '1 .M N... 100644 100644 100644 aaa bbb app.ts',
      '',
    ].join('\0')

    expect(untrackedModules(output)).toEqual(['libs/other'])
  })
})

describe('statusPaths', () => {
  it('should read the path of each kind of entry when the status lists them', () => {
    // Arrange
    const output = [
      '# branch.oid 1234',
      '1 .M N... 100644 100644 100644 aaa bbb src/main file.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 docs/new.md',
      'docs/old.md',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.ts',
      '? notes.txt',
      '',
    ].join('\0')

    // Act
    const paths = statusPaths(output)

    // Assert
    expect(paths).toEqual(['src/main file.ts', 'docs/new.md', 'conflict.ts', 'notes.txt'])
  })
})

describe('fingerprint', () => {
  it('should stay the same when nothing changed and change when a changed file is written again', async () => {
    // Arrange
    const path = await repo('acme', { 'main.ts': 'one\n' })
    await writeFile(join(path, 'main.ts'), 'two\n')
    const source = createGitDiffSource()
    const first = await source.fingerprint(path)

    // Act
    const again = await source.fingerprint(path)
    await writeFile(join(path, 'main.ts'), 'three, longer\n')
    const after = await source.fingerprint(path)

    // Assert
    expect(first).toMatch(/^[0-9a-f]{8}$/)
    expect(again).toBe(first)
    expect(after).not.toBe(first)
  })

  it('should change when a new file appears or a commit moves HEAD', async () => {
    const path = await repo('acme', { 'main.ts': 'one\n' })
    const source = createGitDiffSource()
    const clean = await source.fingerprint(path)

    await writeFile(join(path, 'notes.txt'), 'new\n')
    const untracked = await source.fingerprint(path)
    run(path, 'add', '.')
    run(path, 'commit', '-m', 'second')
    const committed = await source.fingerprint(path)

    expect(untracked).not.toBe(clean)
    expect(committed).not.toBe(untracked)
    expect(committed).not.toBe(clean)
  })

  it('should give nothing when the folder is not inside a repository', async () => {
    expect(await createGitDiffSource().fingerprint(directory)).toBeUndefined()
  })

  it('should change when a file already changed is written again from a subfolder', async () => {
    // Arrange
    const path = await repo('acme', { 'main.ts': 'one\n', 'src/app.ts': 'app\n' })
    await writeFile(join(path, 'main.ts'), 'two\n')
    const source = createGitDiffSource()
    const first = await source.fingerprint(join(path, 'src'))

    // Act
    await writeFile(join(path, 'main.ts'), 'three, longer\n')
    const after = await source.fingerprint(join(path, 'src'))

    // Assert
    expect(after).not.toBe(first)
  })

  it('should change when a file already changed inside a nested submodule is written again', async () => {
    // Arrange
    const acme = await nested()
    const deep = join(acme, 'libs/lib/vendor/deep/src/deep.txt')
    await writeFile(deep, `${numbered(3)}deep\n`)
    const source = createGitDiffSource()
    const first = await source.fingerprint(acme)
    const again = await source.fingerprint(acme)

    // Act
    await writeFile(deep, `${numbered(3)}deep, written again\n`)
    const after = await source.fingerprint(acme)

    // Assert
    expect(again).toBe(first)
    expect(after).not.toBe(first)
  })

  it('should change when a submodule gets a new commit while it already had one', async () => {
    // Arrange
    const acme = await nested()
    const lib = join(acme, 'libs/lib')
    run(lib, 'commit', '-q', '--allow-empty', '-m', 'One')
    const source = createGitDiffSource()
    const first = await source.fingerprint(acme)

    // Act
    run(lib, 'commit', '-q', '--allow-empty', '-m', 'Two')
    const after = await source.fingerprint(acme)

    // Assert
    expect(after).not.toBe(first)
  })
  it('should change when a submodule stages an edit, commits it and gets another commit', async () => {
    // Arrange
    const acme = await nested()
    const lib = join(acme, 'libs/lib')
    await writeFile(join(lib, 'x.txt'), numbered(4))
    const source = createGitDiffSource()
    const edited = await source.fingerprint(acme)

    // Act
    run(lib, 'add', 'x.txt')
    const staged = await source.fingerprint(acme)
    run(lib, 'commit', '-q', '-m', 'Grow x')
    const committed = await source.fingerprint(acme)
    run(lib, 'commit', '-q', '--allow-empty', '-m', 'Note x')
    const moved = await source.fingerprint(acme)

    // Assert
    expect(new Set([edited, staged, committed, moved]).size).toBe(4)
  })
})

describe('statusModules', () => {
  it('should name every changed submodule when the status lists them', () => {
    const output = [
      '1 .M S..U 160000 160000 160000 aaa aaa libs/other',
      '1 .M SC.. 160000 160000 160000 aaa aaa libs/lib',
      '1 .M N... 100644 100644 100644 aaa bbb app.ts',
      '? notes.txt',
      '',
    ].join('\0')

    expect(statusModules(output)).toEqual(['libs/other', 'libs/lib'])
  })
})
