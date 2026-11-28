import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitIgnoreCheck } from './git-ignore.ts'
import type { GitRun } from './git-run.ts'

let directory = ''

beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'dck-ignore-')))
})

// Windows cannot remove a folder while a git process that ran in it is still closing
afterEach(() => rm(directory, { recursive: true, force: true, maxRetries: 10 }))

describe('createGitIgnoreCheck', () => {
  it('should tell an ignored file from a tracked one when the repository ignores it', async () => {
    // Arrange
    execFileSync('git', ['init', '-q'], { cwd: directory })
    await mkdir(join(directory, 'dist'))
    await writeFile(join(directory, '.gitignore'), 'dist/\n.env\n')
    await writeFile(join(directory, '.env'), 'TOKEN=x\n')
    await writeFile(join(directory, 'dist', 'app.js'), 'x\n')
    await writeFile(join(directory, 'app.ts'), 'x\n')
    const check = createGitIgnoreCheck()

    // Act
    const answers = await Promise.all(
      ['.env', 'dist/app.js', 'app.ts'].map((name) => check.isIgnored(join(directory, name))),
    )

    // Assert
    expect(answers).toEqual([true, true, false])
  })

  it('should answer false when the file is outside any repository', async () => {
    await writeFile(join(directory, 'notes.txt'), 'x\n')

    expect(await createGitIgnoreCheck().isIgnored(join(directory, 'notes.txt'))).toBe(false)
  })

  it('should answer false when git is missing', async () => {
    const missing: GitRun = async () => ({ ok: false, failure: { kind: 'missing' } })

    expect(await createGitIgnoreCheck(missing).isIgnored('/home/ana/acme/.env')).toBe(false)
  })
})
