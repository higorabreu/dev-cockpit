import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitFiles, listGit } from './git-files.ts'

let directory = ''

const run = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'protocol.file.allow=always', ...args],
    { cwd, stdio: 'ignore' },
  )

async function write(root: string, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, ...file.split('/'))
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content)
  }
}

async function repo(name: string, files: Record<string, string>) {
  const path = join(directory, name)
  await mkdir(path, { recursive: true })
  run(path, 'init', '-b', 'main')
  await write(path, files)
  run(path, 'add', '.')
  run(path, 'commit', '-m', 'first')
  return path
}

beforeEach(async () => {
  // macOS links /var to /private/var and git reports the real path
  directory = await realpath(await mkdtemp(join(tmpdir(), 'dck-files-')))
})

// Windows cannot remove a folder while a git process that ran in it is still closing
afterEach(() => rm(directory, { recursive: true, force: true, maxRetries: 10 }))

describe('createGitFiles', () => {
  it('should be undefined when the folder is not inside a repository', async () => {
    expect(await createGitFiles().tracked(directory)).toBeUndefined()
  })

  it('should list tracked files first, then untracked and ignored ones with ignored folders closed', async () => {
    const path = await repo('acme', {
      '.gitignore': '.env\nnode_modules/\ndist/\n',
      'src/app.ts': 'app',
    })
    await write(path, {
      'notes.md': 'new',
      '.env': 'TOKEN=x',
      'node_modules/react/index.js': 'x',
      'node_modules/react/cjs/react.js': 'x',
      'dist/app.js': 'x',
    })

    const files = createGitFiles()
    const tracked = await files.tracked(join(path, 'src'))
    const others = await files.others(path)

    expect(tracked).toEqual({ root: path, files: ['.gitignore', 'src/app.ts'], truncated: false })
    expect(others.files).toEqual(['notes.md'])
    expect([...others.ignored].sort()).toEqual(['.env', 'dist/', 'node_modules/'])
    expect(others.truncated).toBe(false)
  })

  it('should list the tracked files of a submodule when the repository has one', async () => {
    const library = await repo('library', { 'lib.ts': 'lib' })
    const path = await repo('app', { 'main.ts': 'main' })
    run(path, 'submodule', 'add', library, 'vendor/library')
    run(path, 'commit', '-m', 'submodule')

    const tracked = await createGitFiles().tracked(path)

    expect(tracked?.files).toContain('vendor/library/lib.ts')
  })
})

describe('listGit', () => {
  it('should stop git and mark the list truncated when the cap is reached', async () => {
    const path = await repo('many', { 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' })

    const answer = await listGit(path, ['ls-files', '-z'], { timeoutMs: 5000, maxEntries: 2 })

    expect(answer).toEqual({ entries: ['a.txt', 'b.txt'], truncated: true })
  })

  it('should be undefined when git fails', async () => {
    const answer = await listGit(directory, ['ls-files', '-z'], { timeoutMs: 5000, maxEntries: 10 })

    expect(answer).toBeUndefined()
  })
})
