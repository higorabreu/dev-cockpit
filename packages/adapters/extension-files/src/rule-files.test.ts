import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUILT_IN_RULES, formatRuleFile, resolveRules, silentLogger } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRuleFiles } from './rule-files.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-rules-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const files = createRuleFiles()

describe('createRuleFiles', () => {
  it('should give back every built-in example unchanged when it is written, read and resolved', async () => {
    const folder = join(root, 'backend', '.dck', 'rules')
    for (const { rule } of BUILT_IN_RULES) {
      await files.writeText(join(folder, `${rule.id}.md`), formatRuleFile(rule), root)
    }

    const read = await files.list(folder)
    const { rules, invalid } = resolveRules(
      read.map((file) => ({ ...file, source: 'repository', extension: 'dck.repository' })),
    )

    expect(invalid).toEqual([])
    expect(rules.map(({ layers, checks, ...rule }) => rule)).toEqual(
      BUILT_IN_RULES.map(({ rule }) => rule).sort((a, b) => a.id.localeCompare(b.id)),
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

  it('should list a file with the first line of the YAML error when its front matter cannot be parsed', async () => {
    await writeFile(join(root, 'broken.md'), '---\nid: [unclosed\n---\nThe body.\n')

    const read = await files.list(root)

    expect(read).toEqual([
      {
        path: join(root, 'broken.md'),
        frontMatter: undefined,
        body: 'The body.\n',
        problem:
          'front matter: YAMLParseError: Flow sequence in block collection must be sufficiently indented and end with a ] at line 1, column 14:',
      },
    ])
  })

  it('should list nothing when the folder does not exist', async () => {
    expect(await files.list(join(root, 'missing'))).toEqual([])
  })

  it('should be undefined when the file to read does not exist', async () => {
    expect(await files.readText(join(root, 'AGENTS.md'))).toEqual({ ok: true, value: undefined })
  })

  it('should create the folder and leave no temporary file when writing', async () => {
    const path = join(root, 'new', 'rules', 'branch-format.md')

    await files.writeText(path, 'first', root)
    const result = await files.writeText(path, 'second', root)

    expect(result).toEqual({ ok: true, value: undefined })
    expect(await readFile(path, 'utf8')).toBe('second')
    expect(await readdir(join(root, 'new', 'rules'))).toEqual(['branch-format.md'])
  })

  it('should leave the target of a planted link alone when the temporary name is a link', async () => {
    const outside = join(root, 'bashrc')
    await writeFile(outside, 'alias ls=ls\n')
    const path = join(root, 'acme', 'AGENTS.md')
    await mkdir(join(root, 'acme'))
    await symlink(outside, `${path}.tmp`)

    await files.writeText(path, 'the block\n', root)

    expect(await readFile(outside, 'utf8')).toBe('alias ls=ls\n')
    expect(await readFile(path, 'utf8')).toBe('the block\n')
  })

  it('should remove the temporary file when the rename fails', async () => {
    const path = join(root, 'acme', 'AGENTS.md')
    await mkdir(join(path, 'inside'), { recursive: true })

    const result = await files.writeText(path, 'the block\n', root)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-002' } } })
    expect(await readdir(join(root, 'acme'))).toEqual(['AGENTS.md'])
  })

  it('should refuse to write when the file is a link, leaving its target as it was', async () => {
    const outside = join(root, 'bashrc')
    await writeFile(outside, 'alias ls=ls\n')
    const repository = join(root, 'acme')
    await mkdir(repository)
    await symlink(outside, join(repository, 'AGENTS.md'))

    const result = await files.writeText(join(repository, 'AGENTS.md'), 'the block\n', repository)

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-002' } } })
    expect(await readFile(outside, 'utf8')).toBe('alias ls=ls\n')
  })

  it.each([['.dck'], ['.dck/rules']])(
    'should refuse to write when the folder %s is a link',
    async (linked) => {
      const elsewhere = join(root, 'elsewhere')
      await mkdir(join(elsewhere, 'rules'), { recursive: true })
      const repository = join(root, 'acme')
      await mkdir(join(repository, linked, '..'), { recursive: true })
      await symlink(join(elsewhere, linked === '.dck' ? '' : 'rules'), join(repository, linked))
      const path = join(repository, '.dck', 'rules', 'branch-format.md')

      const result = await files.writeText(path, 'text', repository)

      expect(result).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-002' } } })
      expect(await readdir(join(elsewhere, 'rules'))).toEqual([])
    },
  )

  it('should refuse to read a file when it is a link, a pipe or larger than 256 KB', async () => {
    await writeFile(join(root, 'secret'), 'token\n')
    await symlink(join(root, 'secret'), join(root, 'linked.md'))
    await symlink('/dev/zero', join(root, 'zero.md'))
    execFileSync('mkfifo', [join(root, 'pipe.md')])
    await writeFile(join(root, 'large.md'), 'a'.repeat(256 * 1024 + 1))

    const reads = await Promise.all(
      ['linked.md', 'zero.md', 'pipe.md', 'large.md'].map((name) =>
        files.readText(join(root, name)),
      ),
    )

    expect(reads.map((read) => read.ok)).toEqual([false, false, false, false])
  })

  it('should report a link, a pipe and a large file of a folder as unusable with their paths', async () => {
    await writeFile(join(root, 'secret'), '---\nid: secret\n---\n')
    await symlink(join(root, 'secret'), join(root, 'linked.md'))
    await symlink('/dev/zero', join(root, 'zero.md'))
    execFileSync('mkfifo', [join(root, 'pipe.md')])
    await writeFile(join(root, 'large.md'), 'a'.repeat(256 * 1024 + 1))
    const problem = 'not a regular file of at most 256 KB'

    const read = await files.list(root)

    expect(read).toEqual(
      ['large.md', 'linked.md', 'pipe.md', 'zero.md'].map((name) => ({
        path: join(root, name),
        frontMatter: undefined,
        body: '',
        problem,
      })),
    )
  })

  it('should list nothing when the rules folder is a link', async () => {
    await mkdir(join(root, 'elsewhere'))
    await writeFile(join(root, 'elsewhere', 'team.md'), '---\nid: team\n---\n')
    await symlink(join(root, 'elsewhere'), join(root, 'rules'))

    expect(await files.list(join(root, 'rules'))).toEqual([])
  })

  it('should read the first 200 files and warn once when the folder holds more', async () => {
    const names = Array.from({ length: 201 }, (_, index) => `s${String(index).padStart(3, '0')}.md`)
    await Promise.all(names.map((name) => writeFile(join(root, name), '---\nid: s\n---\n')))
    const warnings: string[] = []
    const logged = createRuleFiles({
      logger: { ...silentLogger, warn: (message) => void warnings.push(message) },
    })

    const read = await logged.list(root)

    expect(read.map((file) => file.path)).toEqual(
      names.slice(0, 200).map((name) => join(root, name)),
    )
    expect(warnings).toEqual(['rules folder holds too many files'])
  })
})
