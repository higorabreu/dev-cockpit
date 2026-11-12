import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUILT_IN_STANDARDS, formatStandardFile, resolveStandards } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStandardFiles } from './standard-files.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-standards-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const files = createStandardFiles()

describe('createStandardFiles', () => {
  it('should give back every built-in example unchanged when it is written, read and resolved', async () => {
    const folder = join(root, 'backend', '.dck', 'standards')
    for (const { standard } of BUILT_IN_STANDARDS) {
      await files.writeText(join(folder, `${standard.id}.md`), formatStandardFile(standard))
    }

    const read = await files.list(folder)
    const { standards, invalid } = resolveStandards(
      read.map((file) => ({ ...file, source: 'repository', extension: 'dck.repository' })),
    )

    expect(invalid).toEqual([])
    expect(standards.map(({ layers, rules, ...standard }) => standard)).toEqual(
      BUILT_IN_STANDARDS.map(({ standard }) => standard).sort((a, b) => a.id.localeCompare(b.id)),
    )
  })

  it('should list only the markdown files directly inside, sorted by name, when the folder has other entries', async () => {
    await mkdir(join(root, 'nested.md'), { recursive: true })
    await writeFile(join(root, 'nested.md', 'inner.md'), '---\nid: inner\n---\n')
    await writeFile(join(root, 'zeta.md'), '---\nid: zeta\n---\nLast.\n')
    await writeFile(join(root, 'Beta.md'), '﻿---\r\nid: beta\r\n---\r\nFirst.\r\n')
    await writeFile(join(root, 'alpha.md'), 'Only a note.\n')
    await writeFile(join(root, 'notes.txt'), '---\nid: notes\n---\n')

    const read = await files.list(root)

    expect(read).toEqual([
      { path: join(root, 'Beta.md'), frontMatter: { id: 'beta' }, body: 'First.\n' },
      { path: join(root, 'alpha.md'), frontMatter: undefined, body: 'Only a note.\n' },
      { path: join(root, 'zeta.md'), frontMatter: { id: 'zeta' }, body: 'Last.\n' },
    ])
  })

  it('should still list a file, without a front matter, when its YAML cannot be parsed', async () => {
    await writeFile(join(root, 'broken.md'), '---\nid: [unclosed\n---\nThe body.\n')

    const read = await files.list(root)

    expect(read).toEqual([
      { path: join(root, 'broken.md'), frontMatter: undefined, body: 'The body.\n' },
    ])
  })

  it('should list nothing when the folder does not exist', async () => {
    expect(await files.list(join(root, 'missing'))).toEqual([])
  })

  it('should be undefined when the file to read does not exist', async () => {
    expect(await files.readText(join(root, 'AGENTS.md'))).toBeUndefined()
  })

  it('should create the folder and leave no temporary file when writing', async () => {
    const path = join(root, 'new', 'standards', 'branch-format.md')

    await files.writeText(path, 'first')
    await files.writeText(path, 'second')

    expect(await readFile(path, 'utf8')).toBe('second')
    expect(await readdir(join(root, 'new', 'standards'))).toEqual(['branch-format.md'])
  })

  it('should leave the target of a planted link alone when the temporary name is a link', async () => {
    const outside = join(root, 'bashrc')
    await writeFile(outside, 'alias ls=ls\n')
    const path = join(root, 'acme', 'AGENTS.md')
    await mkdir(join(root, 'acme'))
    await symlink(outside, `${path}.tmp`)

    await files.writeText(path, 'the block\n')

    expect(await readFile(outside, 'utf8')).toBe('alias ls=ls\n')
    expect(await readFile(path, 'utf8')).toBe('the block\n')
  })

  it('should remove the temporary file when the rename fails', async () => {
    const path = join(root, 'acme', 'AGENTS.md')
    await mkdir(join(path, 'inside'), { recursive: true })

    await expect(files.writeText(path, 'the block\n')).rejects.toThrow()

    expect(await readdir(join(root, 'acme'))).toEqual(['AGENTS.md'])
  })

  it('should go through the given file access when one is passed in', async () => {
    const written: string[] = []
    const memory = createStandardFiles({
      fs: {
        readDir: async () => [{ name: 'a.md', isDirectory: false }],
        readFile: async () => '---\nenabled: false\n---\n',
        writeFile: async (path) => void written.push(path),
      },
    })

    const read = await memory.list('standards')
    await memory.writeText('standards/b.md', 'text')

    expect(read).toEqual([
      { path: join('standards', 'a.md'), frontMatter: { enabled: false }, body: '' },
    ])
    expect(written).toEqual(['standards/b.md'])
  })
})
