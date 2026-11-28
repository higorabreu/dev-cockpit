import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { ErrorBody, Result } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitReviewNotes } from './git-review-notes.ts'

let directory = ''

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
  })

async function repo(name: string) {
  const path = join(directory, name)
  await mkdir(path, { recursive: true })
  git(path, 'init', '-q', '-b', 'main')
  await writeFile(join(path, 'invoice.ts'), 'export const total = 1\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'first')
  return path
}

function value(result: Result<string, ErrorBody>): string {
  if (!result.ok) throw new Error(`invariant: ${JSON.stringify(result)}`)
  return result.value
}

// One clock that moves a second per review, so each gets its own name
function ticking(start = new Date(2026, 10, 17, 14, 30, 0)) {
  let seconds = 0
  return () => new Date(start.getTime() + 1000 * seconds++)
}

beforeEach(async () => {
  // macOS links /var to /private/var and Git reports the real path
  directory = await realpath(await mkdtemp(join(tmpdir(), 'dck-notes-')))
})

// Windows cannot remove a folder while a git process that ran in it is still closing
afterEach(() => rm(directory, { recursive: true, force: true, maxRetries: 10 }))

// Windows keeps no Unix mode bits, so privacy there comes from the user's profile folder
const unixModes = process.platform !== 'win32'

describe('createGitReviewNotes', () => {
  it('should write the review in the git folder of a repository, private and out of git status', async () => {
    // Arrange
    const root = await repo('backend')
    const notes = createGitReviewNotes({ now: ticking() })

    // Act
    const path = value(await notes.save(root, '# Review comments\n'))

    // Assert
    expect(path).toBe(join(root, '.git', 'dck', 'review-20261117-143000.md'))
    expect(await readFile(path, 'utf8')).toBe('# Review comments\n')
    if (unixModes) {
      expect((await stat(path)).mode & 0o777).toBe(0o600)
      expect((await stat(join(root, '.git', 'dck'))).mode & 0o777).toBe(0o700)
    }
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('should keep only the newest five reviews when more are written', async () => {
    const root = await repo('backend')
    const notes = createGitReviewNotes({ now: ticking() })
    await writeFile(join(root, '.git', 'keep.md'), 'not a review\n')

    for (let index = 0; index < 7; index++) await notes.save(root, `# ${index}\n`)

    expect((await readdir(join(root, '.git', 'dck'))).sort()).toEqual([
      'review-20261117-143002.md',
      'review-20261117-143003.md',
      'review-20261117-143004.md',
      'review-20261117-143005.md',
      'review-20261117-143006.md',
    ])
  })

  it('should give a second review in the same second its own name', async () => {
    const root = await repo('backend')
    const notes = createGitReviewNotes({ now: () => new Date(2026, 10, 17, 14, 30, 0) })

    const first = value(await notes.save(root, 'one\n'))
    const second = value(await notes.save(root, 'two\n'))

    expect([first, second].map((path) => basename(path))).toEqual([
      'review-20261117-143000.md',
      'review-20261117-143000-2.md',
    ])
    expect(await readFile(first, 'utf8')).toBe('one\n')
  })

  it('should write to the temporary folder when the repository is a linked worktree', async () => {
    // Arrange
    const main = await repo('backend')
    const linked = join(directory, 'backend-fix')
    git(main, 'worktree', 'add', '-q', '-b', 'fix', linked)
    const temporary = join(directory, 'tmp')
    await mkdir(temporary)
    const notes = createGitReviewNotes({ now: ticking(), tempFolder: () => temporary })

    // Act
    const path = value(await notes.save(linked, '# Review comments\n'))

    // Assert
    expect(path).toBe(join(temporary, 'dck-review-20261117-143000.md'))
    if (unixModes) expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await readdir(join(main, '.git'))).not.toContain('dck')
    expect(git(linked, 'status', '--porcelain')).toBe('')
  })

  it('should fail with the git code when the folder is not a repository', async () => {
    const result = await createGitReviewNotes().save(directory, 'x')

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-GIT-001' } } })
  })

  it('should fail with its own code and leave nothing behind when the file cannot be written', async () => {
    // Arrange
    const root = await repo('backend')
    const removed: string[] = []
    const notes = createGitReviewNotes({
      files: {
        mkdir: async () => undefined,
        writeNew: async () => undefined,
        rename: async () => {
          throw new Error('EXDEV')
        },
        list: async () => [],
        remove: async (path) => void removed.push(path),
        exists: async () => false,
        realpath: async (path) => path,
      },
    })

    // Act
    const result = await notes.save(root, 'x')

    // Assert
    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-GIT-006' } } })
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatch(/\.review-[0-9a-f]{12}\.tmp$/)
  })
})
