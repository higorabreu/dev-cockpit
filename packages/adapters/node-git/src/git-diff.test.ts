import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DiffOutcome, DiffRequest, ErrorBody, Result } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitDiffSource } from './git-diff.ts'
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
  directory = await mkdtemp(join(tmpdir(), 'dck-diff-'))
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

    expect(branch.base).toBe('main')
    expect(uncommitted.base).toBe('main')
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

    expect(diff.base).toBe('trunk')
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
