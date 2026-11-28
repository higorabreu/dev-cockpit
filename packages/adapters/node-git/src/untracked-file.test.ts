import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DiffOutcome, ErrorBody, Result } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitDiffSource } from './git-diff.ts'
import { type GitRun, runGit } from './git-run.ts'
import { addedFile, needsGit, untrackedPlans } from './untracked-file.ts'

let directory = ''

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    stdio: 'ignore',
  })

async function repo(name: string, files: Record<string, string | Buffer>) {
  const path = join(directory, name)
  await mkdir(path, { recursive: true })
  git(path, 'init', '-q', '-b', 'main')
  git(path, 'config', 'core.autocrlf', 'false')
  git(path, 'commit', '-q', '--allow-empty', '-m', 'first')
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(path, file, '..'), { recursive: true })
    await writeFile(join(path, file), content)
  }
  return path
}

// The reader before this change: every untracked file through `git diff --no-index`. Failing the
// attribute check sends every file there, which is the old path kept for the files git transforms
function readers() {
  const byGit: string[] = []
  const oldByGit: string[] = []
  const counting: GitRun = (cwd, args, options) => {
    if (args.includes('--no-index')) byGit.push(args.at(-1) ?? '')
    return runGit(cwd, args, options)
  }
  const old: GitRun = (cwd, args, options) => {
    if (args.includes('--no-index')) oldByGit.push(args.at(-1) ?? '')
    if (args[0] === 'check-attr' && args.includes('working-tree-encoding'))
      return Promise.resolve({ ok: false, failure: { kind: 'exit', code: 128, stderr: '' } })
    return runGit(cwd, args, options)
  }
  return {
    byGit,
    oldByGit,
    current: createGitDiffSource({ run: counting }),
    old: createGitDiffSource({ run: old }),
  }
}

function files(result: Result<DiffOutcome, ErrorBody>) {
  if (!result.ok || result.value.kind !== 'ok')
    throw new Error(`invariant: ${JSON.stringify(result)}`)
  return result.value.diff.files
}

const lines = (count: number, width: number) =>
  Array.from({ length: count }, (_, index) => `${index} ${'x'.repeat(width)}`).join('\n')

const FIXTURES: Record<string, string | Buffer> = {
  'text.ts': 'export const a = 1\nexport const b = 2\n',
  'single-line.txt': 'one\n',
  'blank-line.txt': '\n',
  'win.txt': 'one\r\ntwo\r\n',
  'win-no-newline.txt': 'one\r\ntwo\r',
  'no-newline.txt': 'one\ntwo',
  'lone-cr.txt': 'one\rtwo\n',
  'whitespace.txt': 'a  b\n \t \n\tc\n',
  'function.js': 'function f() {\n  return 1\n}\n',
  'empty.txt': '',
  'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]),
  'late-nul.txt': Buffer.concat([
    Buffer.from('a'.repeat(8000)),
    Buffer.from([0]),
    Buffer.from('\n'),
  ]),
  'early-nul.txt': Buffer.concat([
    Buffer.from('a'.repeat(7999)),
    Buffer.from([0]),
    Buffer.from('\n'),
  ]),
  'latin.txt': Buffer.from('caf\xe9\n', 'latin1'),
  'cut.txt': Buffer.from([0x61, 0xc3]),
  'replacement.txt': 'already � here\n',
  'bom.txt': '﻿with a mark\n',
  'large.sql': `${lines(9000, 100)}\n`,
  'over.sql': 'x'.repeat(1024 * 1024 + 1),
  'folder with space/ação ☃.md': 'olá\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'dist/app.js': 'built\n',
  'run.sh': '#!/bin/sh\necho hi\n',
}

beforeEach(async () => {
  // macOS links /var to /private/var and Git reports the real path
  directory = await realpath(await mkdtemp(join(tmpdir(), 'dck-untracked-')))
})

// Windows cannot remove a folder while a git process that ran in it is still closing
afterEach(() => rm(directory, { recursive: true, force: true, maxRetries: 10 }))

// Windows creates symbolic links only in Developer Mode or as an administrator (as CI runners are)
function canCreateSymlinks(): boolean {
  const probe = mkdtempSync(join(tmpdir(), 'dck-link-'))
  try {
    symlinkSync(probe, join(probe, 'link'))
    return true
  } catch {
    return false
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
}
const symlinks = canCreateSymlinks()

describe('untracked files read in process', () => {
  it.runIf(symlinks).each([[false], [true]])(
    'should equal what git diff --no-index gives when reading every kind of file (ignore whitespace: %s)',
    async (ignoreWhitespace) => {
      // Arrange
      const path = await repo('kinds', FIXTURES)
      await chmod(join(path, 'run.sh'), 0o755)
      await symlink('text.ts', join(path, 'link.ts'))
      await symlink('missing.txt', join(path, 'dangling'))
      await symlink('folder with space', join(path, 'to-folder'))
      await symlink('large.sql', join(path, 'to-large'))
      await symlink('over.sql', join(path, 'to-over'))
      await symlink('loop', join(path, 'loop'))
      const { byGit, oldByGit, current, old } = readers()
      const request = { cwd: path, scope: 'uncommitted' as const, ignoreWhitespace }

      // Act
      const read = files(await current.diff(request))
      const expected = files(await old.diff(request))

      // Assert
      expect(read).toEqual(expected)
      expect(read).toHaveLength(Object.keys(FIXTURES).length + 6)
      expect(read.filter((file) => file.unloaded).map((file) => file.path)).toEqual(['to-folder'])
      expect(byGit).toEqual([])
      expect(oldByGit).toHaveLength(read.filter((file) => !file.omitted).length)
    },
  )

  it.runIf(symlinks)(
    'should equal git and keep git only for the files it transforms when attributes or settings apply',
    async () => {
      // Arrange
      const path = await repo('attributes', {
        '.gitattributes': [
          '*.dat binary',
          'forced.txt diff',
          'driver.txt diff=custom',
          'eol-*.txt text eol=lf',
          'kept.txt -text',
          '',
        ].join('\n'),
        'blob.dat': 'plain text\n',
        'forced.txt': Buffer.from('a\0b\n'),
        'driver.txt': 'driven\n',
        'eol-crlf.txt': 'one\r\ntwo\r\n',
        'eol-lf.txt': 'one\ntwo\n',
        'kept.txt': 'one\r\n',
        'plain-crlf.txt': 'one\r\n',
        'big.txt': 'x'.repeat(200),
      })
      git(path, 'config', 'core.bigFileThreshold', '100')
      await symlink('big.txt', join(path, 'link'))
      const { byGit, current, old } = readers()
      const request = { cwd: path, scope: 'uncommitted' as const, ignoreWhitespace: false }

      // Act
      const read = files(await current.diff(request))
      const expected = files(await old.diff(request))

      // Assert
      expect(read).toEqual(expected)
      expect(read.find((file) => file.path === 'big.txt')).toMatchObject({ binary: true })
      expect(byGit.sort()).toEqual(['driver.txt', 'eol-crlf.txt'])
    },
  )

  it('should equal git and send only the files with a carriage return to git when autocrlf is on', async () => {
    // Arrange
    const path = await repo('autocrlf', { 'win.txt': 'one\r\n', 'unix.txt': 'one\n' })
    git(path, 'config', 'core.autocrlf', 'true')
    const { byGit, current, old } = readers()
    const request = { cwd: path, scope: 'uncommitted' as const, ignoreWhitespace: false }

    // Act
    const read = files(await current.diff(request))
    const expected = files(await old.diff(request))

    // Assert
    expect(read).toEqual(expected)
    expect(read.find((file) => file.path === 'win.txt')).toMatchObject({ crlf: false })
    expect(byGit).toEqual(['win.txt'])
  })

  it('should equal git when one file is asked for by path, a folder failing on both', async () => {
    // Arrange
    const path = await repo('by-path', { 'notes.txt': 'one\ntwo', 'folder/inner.txt': 'x\n' })
    const { byGit, current, old } = readers()

    // Act
    const notes = await current.untrackedFile(path, 'notes.txt', true)
    const folder = await current.untrackedFile(path, 'folder', false)

    // Assert
    expect(notes).toEqual(await old.untrackedFile(path, 'notes.txt', true))
    expect(notes).toMatchObject({ ok: true, value: { newLineCount: 2, additions: 2 } })
    expect(folder).toEqual(await old.untrackedFile(path, 'folder', false))
    expect(folder.ok).toBe(false)
    expect(byGit).toEqual([])
  })

  it('should list a file as not loaded when it cannot be read', async () => {
    // Arrange
    const path = await repo('unreadable', { 'secret.txt': 'x\n' })
    const source = createGitDiffSource({
      files: {
        readFile: () => Promise.reject(new Error('EACCES')),
        size: () => Promise.resolve(2),
        realpath: (file) => realpath(file),
        readLink: () => Promise.resolve(undefined),
        stamp: () => Promise.resolve(undefined),
      },
    })

    // Act
    const read = files(
      await source.diff({ cwd: path, scope: 'uncommitted', ignoreWhitespace: false }),
    )

    // Assert
    expect(read).toEqual([expect.objectContaining({ path: 'secret.txt', unloaded: true })])
  })
})

describe('untrackedPlans', () => {
  const attributes = (path: string, values: Record<string, string>) =>
    Object.entries(values)
      .map(([name, value]) => `${path}\0${name}\0${value}\0`)
      .join('')

  it('should read binary, text and driver from the diff attribute', () => {
    const plans = untrackedPlans(
      attributes('a', { diff: 'unset' }) +
        attributes('b', { diff: 'set' }) +
        attributes('c', { diff: 'custom' }) +
        attributes('d', { diff: 'unspecified' }),
      '',
    )

    expect(
      [plans('a'), plans('b'), plans('c'), plans('d')].map((plan) => [plan.text, plan.git]),
    ).toEqual([
      ['binary', false],
      ['text', false],
      ['auto', true],
      ['auto', false],
    ])
  })

  it('should send every file to git when the attributes could not be read', () => {
    expect(untrackedPlans(undefined, '')('a').git).toBe(true)
  })

  it('should read autocrlf and the big file threshold when the settings name them', () => {
    const plan = untrackedPlans(
      attributes('a', { diff: 'unspecified' }),
      'core.autocrlf input\ncore.bigfilethreshold 2k\n',
    )('a')

    expect(plan).toMatchObject({ lineEnds: true, bigFile: 2048 })
  })

  it('should leave line ends alone when the text attribute is unset even with autocrlf on', () => {
    const plan = untrackedPlans(attributes('a', { text: 'unset' }), 'core.autocrlf true\n')('a')

    expect(needsGit(plan, Buffer.from('a\r\n'))).toBe(false)
  })
})

describe('addedFile', () => {
  const auto = { text: 'auto', bigFile: undefined } as const

  it('should mark the last line when the file has no final newline', () => {
    const file = addedFile('a.txt', Buffer.from('one\ntwo'), auto, false)

    expect(file.hunks[0]?.lines.at(-1)).toEqual({
      kind: 'add',
      text: 'two',
      old: undefined,
      new: 2,
      noNewline: true,
    })
  })

  it('should not take a symbolic link for a big file when it is past the threshold', () => {
    const file = addedFile('link', Buffer.from('target'), { text: 'auto', bigFile: 2 }, true)

    expect(file).toMatchObject({ binary: false, additions: 1 })
  })
})
