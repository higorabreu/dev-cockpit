import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
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

// Each test here is the checkable version of an AGENTS.md rule that was already broken or could be
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

  // D46: the window shares the daemon's secret store chooser and nothing else of the daemon
  it('should import the daemon only through its secret-store subpath when listing the shell sources', () => {
    const found = offenders(
      sources,
      /from\s+['"]@dck\/daemon(?!\/secret-store['"])/,
      (path) => !path.startsWith('shell/'),
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

const repositoryRoot = join(packagesRoot, '..')
const commentedExtensions = ['.ts', '.tsx', '.mjs', '.css', '.sh']

function commentedFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (['node_modules', 'dist', 'release', 'local'].includes(name)) return []
    if (statSync(path).isDirectory()) return commentedFilesUnder(path)
    return commentedExtensions.some((extension) => path.endsWith(extension)) ? [path] : []
  })
}

const commentText = (line: string): string | undefined =>
  line.match(/(?:^|\s)(?:\/\/+|\/\*+|\*|#)\s(.*)$/)?.[1]

// Comments are English; Portuguese lives only in the pt-BR catalog
const portuguese =
  /[ãõçáéíóúâêôà]|\b(não|para|que|uma|com|dos|das|isso|quando|porque|também|segredos)\b/i

describe('project language', () => {
  it('should keep every comment in English when listing the source and script files', () => {
    const files = [
      ...commentedFilesUnder(packagesRoot),
      ...commentedFilesUnder(join(repositoryRoot, 'scripts')),
      join(repositoryRoot, '.gitignore'),
    ]

    const found = files.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const text = commentText(line)
          return text !== undefined && portuguese.test(text)
            ? [`${relative(repositoryRoot, path)}:${index + 1}`]
            : []
        }),
    )

    expect(found).toEqual([])
  })
})

function directoriesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (name === 'node_modules' || name === 'dist' || !statSync(path).isDirectory()) return []
    return [path, ...directoriesUnder(path)]
  })
}

const MAX_SOURCES_PER_FOLDER = 12

// One file per port is the layout of the core's ports folder, so its size follows the number of ports
const exemptFromSize = (directory: string) =>
  directory === join(packagesRoot, 'core', 'src', 'ports')

describe('project structure', () => {
  it('should keep every source folder small when listing the files of every package', () => {
    const crowded = directoriesUnder(packagesRoot)
      .filter((directory) => !exemptFromSize(directory))
      .flatMap((directory) => {
        const sources = readdirSync(directory).filter(
          (file) => /\.tsx?$/.test(file) && !file.endsWith('.test.ts') && !file.endsWith('.d.ts'),
        )
        return sources.length > MAX_SOURCES_PER_FOLDER ? [relative(repositoryRoot, directory)] : []
      })

    expect(crowded).toEqual([])
  })

  it('should name every source file in lowercase kebab case when listing the packages', () => {
    const misnamed = [...all.map((file) => file.path), ...commentedFilesUnder(packagesRoot)]
      .map((path) => path.split(/[\\/]/).pop() ?? path)
      // pt-BR is a locale tag, so its catalog keeps the standard casing
      .filter((file) => file !== 'pt-BR.ts')
      .filter((file) => !/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)*\.(ts|tsx|css|mjs|sh)$/.test(file))

    expect([...new Set(misnamed)]).toEqual([])
  })
})

describe('agent instructions', () => {
  const rulesDirectory = join(repositoryRoot, '.claude', 'rules')
  const instructionFiles = [
    join(repositoryRoot, 'AGENTS.md'),
    join(repositoryRoot, 'CLAUDE.md'),
    ...readdirSync(rulesDirectory).map((file) => join(rulesDirectory, file)),
  ]

  // Longer instruction files cost context on every request and lower how well they are followed
  it('should keep every instruction file under 200 lines when listing them', () => {
    const long = instructionFiles.filter(
      (path) => readFileSync(path, 'utf8').split('\n').length > 200,
    )

    expect(long.map((path) => relative(repositoryRoot, path))).toEqual([])
  })

  it('should scope every area rule with a paths header when listing the rules', () => {
    const unscoped = readdirSync(rulesDirectory).filter(
      (file) => !readFileSync(join(rulesDirectory, file), 'utf8').startsWith('---\npaths:\n'),
    )

    expect(unscoped).toEqual([])
  })
})

describe('release', () => {
  const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
  const versionOf = (path: string) => (readJson(path) as { version?: string }).version
  const manifests = directoriesUnder(packagesRoot)
    .filter((directory) => readdirSync(directory).includes('package.json'))
    .map((directory) => relative(repositoryRoot, join(directory, 'package.json')))
    .map((path) => path.split(sep).join('/'))
  const config = readJson(join(repositoryRoot, 'release-please-config.json')) as {
    packages: Record<string, { 'extra-files'?: { path: string }[] }>
  }
  const bumped = (config.packages['.']?.['extra-files'] ?? []).map((file) => file.path)

  // release-please only bumps the files it is told about, so a package left out keeps an old version
  it('should list every workspace package in the extra files when reading the release config', () => {
    const missing = manifests.filter((path) => !bumped.includes(path))

    expect(missing).toEqual([])
  })

  it('should give every workspace package the root version when reading the manifests', () => {
    const rootVersion = versionOf(join(repositoryRoot, 'package.json'))

    const stale = manifests.filter((path) => versionOf(join(repositoryRoot, path)) !== rootVersion)

    expect(stale).toEqual([])
  })
})
