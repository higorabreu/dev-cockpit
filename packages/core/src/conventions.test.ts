import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const packagesRoot = join(import.meta.dirname, '..', '..')

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (name === 'node_modules' || name === 'dist') return []
    if (statSync(path).isDirectory()) return filesUnder(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

const all = filesUnder(packagesRoot).map((path) => ({
  path: relative(packagesRoot, path),
  text: readFileSync(path, 'utf8'),
}))
const isTest = (path: string) => path.endsWith('.test.ts')
const sources = all.filter((file) => !isTest(file.path))
const tests = all.filter((file) => isTest(file.path))

const offenders = (
  files: readonly { path: string; text: string }[],
  pattern: RegExp,
  skip: (path: string) => boolean = () => false,
) => files.filter((file) => !skip(file.path) && pattern.test(file.text)).map((file) => file.path)

// Cada teste aqui é a versão verificável de uma regra do CLAUDE.md que já foi quebrada ou pode ser
describe('project conventions', () => {
  it('should return ErrorBody as the failure of every Result when listing the sources', () => {
    const found = offenders(sources, /Result<[^;]{0,200}?,\s*(ErrorCode|string|Error)\s*>/)

    expect(found).toEqual([])
  })

  it('should build the failure with errorBody when calling fail with an error code', () => {
    const found = offenders(all, /\bfail\(\s*['"`]DCK-/)

    expect(found).toEqual([])
  })

  it('should not silence an exception with an empty catch when listing all files', () => {
    const found = offenders(all, /catch\s*(\([^)]*\))?\s*\{\s*\}/)

    expect(found).toEqual([])
  })

  it('should keep the core free of other packages and of node modules when listing its sources', () => {
    const found = offenders(
      sources,
      /from\s+['"](@dck\/|node:)/,
      (path) => !path.startsWith('core/src/') || path.startsWith('core/src/testing/'),
    )

    expect(found).toEqual([])
  })

  it('should keep adapters independent from each other when listing their sources', () => {
    const found = offenders(
      sources,
      /from\s+['"]@dck\/adapter-/,
      (path) => !path.startsWith('adapters/'),
    )

    expect(found).toEqual([])
  })

  it('should start every test title with should when listing the test files', () => {
    const titles = tests.flatMap((file) =>
      [...file.text.matchAll(/\b(?:it|test)(?:\.each\([^)]*\))?\(\s*(['"`])(.+?)\1/g)].map(
        (match) => ({ path: file.path, title: match[2] ?? '' }),
      ),
    )

    const wrong = titles.filter(({ title }) => !title.startsWith('should '))

    expect(wrong).toEqual([])
  })
})
